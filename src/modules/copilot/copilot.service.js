import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { syncLiveEntitiesToFile, getCachedLiveEntities } from "./copilot.sync.js";

// Load knowledge base JSON
const KB_PATH = path.resolve(process.cwd(), "../rifah_features_knowledge_base.json");

function getKnowledgeBase() {
  try {
    if (fs.existsSync(KB_PATH)) {
      const raw = fs.readFileSync(KB_PATH, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[CopilotService] Error reading knowledge base JSON:", err.message);
  }
  return { organization: {}, roles: [], modules: [], roleSpecificFaqs: {}, liveEntities: {} };
}

/**
 * Normalizes user role string to match knowledge base keys
 */
export function normalizeRole(rawRole) {
  if (!rawRole) return "business_owner";
  const r = String(rawRole).toLowerCase().trim();
  if (r === "central_admin" || r === "admin" || r === "superadmin" || r === "super_admin") {
    return "central_admin";
  }
  if (r === "state_admin" || r === "stateadmin") {
    return "state_admin";
  }
  if (r === "chapter_admin" || r === "chapteradmin") {
    return "chapter_admin";
  }
  return "business_owner";
}

/**
/**
 * Role-aware route link helpers
 */
export function getRoleBusinessLink(role, b = null) {
  if (b) {
    if (typeof b === "object") {
      const slugOrId = b.slug || b.id || b._id;
      if (slugOrId) return `/business/${encodeURIComponent(String(slugOrId).trim())}`;
      if (b.name) return `/business/${encodeURIComponent(String(b.name).toLowerCase().trim().replace(/\s+/g, "-"))}`;
    } else if (typeof b === "string") {
      const trimmed = b.trim();
      if (trimmed.startsWith("/")) return trimmed;
      return `/business/${encodeURIComponent(trimmed.toLowerCase().replace(/\s+/g, "-"))}`;
    }
  }
  return "/discover";
}

export function getRoleChapterLink(role) {
  const r = normalizeRole(role);
  if (r === "central_admin") return "/admin/chapters";
  if (r === "state_admin") return "/state-admin/chapters";
  if (r === "chapter_admin") return "/chapter-admin/operations";
  return "/discover";
}

export function getRoleStateLink(role) {
  const r = normalizeRole(role);
  if (r === "central_admin") return "/admin/states";
  if (r === "state_admin") return "/state-admin";
  return "/discover";
}

/**
 * Filter modules, FAQs, and live entities by user role permissions
 */
export function getFilteredContext(role, liveEntitiesData = null) {
  const kb = getKnowledgeBase();
  const effectiveRole = normalizeRole(role);
  const liveEntities = liveEntitiesData || kb.liveEntities || getCachedLiveEntities();

  // 1. Filter platform modules
  const allowedModules = (kb.modules || []).filter((m) => {
    if (!m.allowedRoles || !Array.isArray(m.allowedRoles)) return false;
    if (effectiveRole === "central_admin") return true;
    return m.allowedRoles.includes(effectiveRole);
  });

  // 2. Filter role-specific FAQs
  const allowedFaqs = (kb.roleSpecificFaqs?.[effectiveRole] || []).concat(
    effectiveRole !== "business_owner" ? kb.roleSpecificFaqs?.["central_admin"] || [] : []
  );

  // 3. Filter live entities by role permissions
  let filteredEntities = {
    centralAdmins: liveEntities?.centralAdmins || [],
    stateAdmins: liveEntities?.stateAdmins || [],
    chapterAdmins: liveEntities?.chapterAdmins || [],
    chapters: liveEntities?.chapters || [],
    businesses: liveEntities?.businesses || [],
  };

  return {
    role: effectiveRole,
    modules: allowedModules,
    faqs: allowedFaqs,
    liveEntities: filteredEntities,
  };
}

/**
 * Intelligent local fallback search when Gemini API key is not configured or unavailable
 */
export function searchKnowledgeBaseFallback(query, role, liveEntitiesData = null) {
  const { modules, faqs, liveEntities } = getFilteredContext(role, liveEntitiesData);
  const q = (query || "").toLowerCase().trim();
  const effectiveRole = normalizeRole(role);
  const bizRoute = getRoleBusinessLink(effectiveRole);
  const chapRoute = getRoleChapterLink(effectiveRole);
  const stateRoute = getRoleStateLink(effectiveRole);

  const norm = (str) => (str ? String(str).toLowerCase().trim() : "");

  // ==========================================
  // PRE-EXTRACT KNOWN STATES, CHAPTERS & CITIES
  // ==========================================
  const allStates = new Set();
  const allChapters = new Set();
  const allCities = new Set();

  (liveEntities.stateAdmins || []).forEach((sa) => {
    if (sa.state && sa.state.length > 2) allStates.add(norm(sa.state));
  });
  (liveEntities.chapterAdmins || []).forEach((ca) => {
    if (ca.chapter) allChapters.add(norm(ca.chapter));
    if (ca.state && saStateValid(ca.state)) allStates.add(norm(ca.state));
  });
  (liveEntities.chapters || []).forEach((ch) => {
    if (ch.name) allChapters.add(norm(ch.name));
    if (ch.city && ch.city.length > 2) allCities.add(norm(ch.city));
    if (ch.state && saStateValid(ch.state)) allStates.add(norm(ch.state));
  });
  (liveEntities.businesses || []).forEach((b) => {
    if (b.chapter) allChapters.add(norm(b.chapter));
    if (b.city && b.city.length > 2) allCities.add(norm(b.city));
    if (b.state && saStateValid(b.state)) allStates.add(norm(b.state));
  });

  function saStateValid(s) {
    if (!s) return false;
    const l = norm(s);
    return l.length > 2 && l !== "unassigned" && l !== "national";
  }

  // 1. Direct explicit geographic matches in user query
  const directStatesInQuery = Array.from(allStates).filter((st) => q.includes(st));

  // Match chapters: match if query contains the full chapter name (or the name minus "chapter")
  const directChaptersInQuery = Array.from(allChapters).filter((ch) => {
    if (ch.length < 3) return false;
    if (q.includes(ch)) return true;
    const baseName = ch.replace(/\s+chapter$/i, "").trim();
    return baseName.length > 3 && q.includes(baseName);
  });

  const directCitiesInQuery = Array.from(allCities).filter((ci) => {
    if (ci.length < 3) return false;
    // Don't treat a city match as isolated if it's already part of a matched chapter name
    return q.includes(ci);
  });

  // Explicit mention of a chapter in query, even if not in the database (e.g. "dubai chapter", "london chapter")
  const explicitChapterMatch =
    q.match(/\b(?:in|for|at|of)\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\s+chapter\b/i) ||
    q.match(/\b([a-z0-9_-]+)\s+chapter\b/i);
  const explicitChapterName = explicitChapterMatch ? explicitChapterMatch[1].trim() : null;

  // Scope Hierarchy:
  // - If user specifically mentions a chapter (e.g. "mumbai chapter", "dubai chapter"): scope is strictly CHAPTER.
  // - Else if user mentions a city (e.g. "aurangabad"): scope is CITY.
  // - Else if user mentions a state (e.g. "maharashtra"): scope is STATE.
  const isChapterScope = directChaptersInQuery.length > 0 || !!explicitChapterName;
  const isCityScope = !isChapterScope && directCitiesInQuery.length > 0 && directStatesInQuery.length === 0;
  const isStateScope = !isChapterScope && directStatesInQuery.length > 0;

  const locationLabel = directChaptersInQuery.length > 0
    ? (directChaptersInQuery.find((ch) => q.includes(ch)) || directChaptersInQuery[0])
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : explicitChapterName
    ? explicitChapterName
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") + " Chapter"
    : isCityScope
    ? directCitiesInQuery[0].charAt(0).toUpperCase() + directCitiesInQuery[0].slice(1)
    : isStateScope
    ? directStatesInQuery[0].charAt(0).toUpperCase() + directStatesInQuery[0].slice(1)
    : "";

  // ==========================================
  // 1. DYNAMIC ENTITY SEARCH (Admins, Chapters & Businesses)
  // ==========================================

  // A. Search Central Admins
  const isCentralAdminQuery =
    q.includes("central admin") ||
    q.includes("central_admin") ||
    q.includes("apex admin") ||
    q.includes("head admin") ||
    q === "admin";

  if (isCentralAdminQuery) {
    const admins = liveEntities.centralAdmins || [];
    if (admins.length === 0) {
      let msg = `### 👑 Central Administrators\nNo active Central Admin found in the active records.`;
      if (effectiveRole === "central_admin") {
        msg += `\n\n👉 Access: [Central Admin Portal](/admin)`;
      }
      return msg;
    }
    let res = `### 👑 Active Central Administrators (${admins.length})\n\n`;
    admins.forEach((a) => {
      res += `- **${a.name}** (${a.email})${a.phone ? ` • Tel: ${a.phone}` : ""}\n`;
      res += `  - Role: \`Central Administrator\` | Status: \`${a.status}\`\n`;
    });
    if (effectiveRole === "central_admin") {
      res += `\n👉 Manage Admins: [Central Admin Desk](/admin/central-admin) | [User Management](/admin/users)`;
    }
    return res;
  }

  // B. Specific Name / Keyword Match across live entities
  const matchedCentral = (liveEntities.centralAdmins || []).filter(
    (a) =>
      (a.name && (q.includes(norm(a.name)) || norm(a.name).includes(q))) ||
      (a.email && (q.includes(norm(a.email)) || norm(a.email).includes(q)))
  );

  const matchedState = (liveEntities.stateAdmins || []).filter((a) => {
    const nameMatch = a.name && (q.includes(norm(a.name)) || norm(a.name).includes(q));
    const emailMatch = a.email && (q.includes(norm(a.email)) || norm(a.email).includes(q));
    if (isChapterScope) {
      // Do not include unrelated state admins when specifically querying a chapter
      return nameMatch || emailMatch;
    }
    if (isStateScope) {
      const stateMatch = a.state && directStatesInQuery.some((st) => norm(a.state).includes(st) || st.includes(norm(a.state)));
      return nameMatch || emailMatch || stateMatch;
    }
    const stateMatch = a.state && a.state.length > 2 && (q.includes(norm(a.state)) || norm(a.state).includes(q));
    return nameMatch || emailMatch || stateMatch;
  });

  const matchedChapter = (liveEntities.chapterAdmins || []).filter((a) => {
    const nameMatch = a.name && (q.includes(norm(a.name)) || norm(a.name).includes(q));
    const emailMatch = a.email && (q.includes(norm(a.email)) || norm(a.email).includes(q));
    if (isChapterScope) {
      const chapMatch =
        a.chapter &&
        directChaptersInQuery.some((ch) => norm(a.chapter).includes(ch) || ch.includes(norm(a.chapter)));
      return nameMatch || emailMatch || chapMatch;
    }
    if (isCityScope) {
      const cityMatch =
        a.chapter &&
        directCitiesInQuery.some((ci) => norm(a.chapter).includes(ci) || ci.includes(norm(a.chapter)));
      return nameMatch || emailMatch || cityMatch;
    }
    if (isStateScope) {
      const stateMatch =
        a.state &&
        directStatesInQuery.some((st) => norm(a.state).includes(st) || st.includes(norm(a.state)));
      return nameMatch || emailMatch || stateMatch;
    }
    const chapMatch = a.chapter && (q.includes(norm(a.chapter)) || norm(a.chapter).includes(q));
    const stateMatch = a.state && a.state.length > 2 && (q.includes(norm(a.state)) || norm(a.state).includes(q));
    return nameMatch || emailMatch || chapMatch || stateMatch;
  });

  const matchedChaptersList = (liveEntities.chapters || []).filter((c) => {
    if (isChapterScope) {
      return directChaptersInQuery.some((ch) => norm(c.name).includes(ch) || ch.includes(norm(c.name)));
    }
    if (isCityScope) {
      return (
        (c.city && directCitiesInQuery.some((ci) => norm(c.city).includes(ci) || ci.includes(norm(c.city)))) ||
        (c.name && directCitiesInQuery.some((ci) => norm(c.name).includes(ci) || ci.includes(norm(c.name))))
      );
    }
    if (isStateScope) {
      return c.state && directStatesInQuery.some((st) => norm(c.state).includes(st) || st.includes(norm(c.state)));
    }
    const nameMatch = c.name && (q.includes(norm(c.name)) || norm(c.name).includes(q));
    const cityMatch = c.city && c.city.length > 2 && (q.includes(norm(c.city)) || norm(c.city).includes(q));
    const stateMatch = c.state && c.state.length > 2 && (q.includes(norm(c.state)) || norm(c.state).includes(q));
    return nameMatch || cityMatch || stateMatch;
  });

  // Filter businesses strictly according to the scope hierarchy
  const matchedBusinesses = (liveEntities.businesses || []).filter((b) => {
    if (isChapterScope) {
      // STRICT CHAPTER SCOPE: Business MUST belong to the queried chapter!
      if (directChaptersInQuery.length > 0) {
        return (
          b.chapter &&
          directChaptersInQuery.some((ch) => norm(b.chapter).includes(ch) || ch.includes(norm(b.chapter)))
        );
      }
      if (explicitChapterName) {
        return (
          b.chapter &&
          (norm(b.chapter).includes(norm(explicitChapterName)) ||
            norm(explicitChapterName).includes(norm(b.chapter)))
        );
      }
      return false;
    }

    if (isCityScope) {
      // STRICT CITY SCOPE: Business must belong to the queried city or local chapter
      const cityMatch =
        b.city &&
        directCitiesInQuery.some((ci) => norm(b.city).includes(ci) || ci.includes(norm(b.city)));
      const chapMatch =
        b.chapter &&
        directCitiesInQuery.some((ci) => norm(b.chapter).includes(ci) || ci.includes(norm(b.chapter)));
      return cityMatch || chapMatch;
    }

    if (isStateScope) {
      // STATE SCOPE: Business belongs to the queried state or its chapters
      const stateMatch =
        b.state &&
        directStatesInQuery.some((st) => norm(b.state).includes(st) || st.includes(norm(b.state)));
      return stateMatch;
    }

    // GENERAL KEYWORD SEARCH (Name, Industry, Category, Owner)
    const nameMatch = b.name && (q.includes(norm(b.name)) || norm(b.name).includes(q));
    const industryMatch = b.industry && (q.includes(norm(b.industry)) || norm(b.industry).includes(q));
    const catMatch =
      Array.isArray(b.categories) &&
      b.categories.some((cat) => q.includes(norm(cat)) || norm(cat).includes(q));
    const ownerMatch =
      b.ownerName && b.ownerName.length > 2 && (q.includes(norm(b.ownerName)) || norm(b.ownerName).includes(q));
    const emailMatch = b.ownerEmail && (q.includes(norm(b.ownerEmail)) || norm(b.ownerEmail).includes(q));
    const cityMatch = b.city && b.city.length > 2 && (q.includes(norm(b.city)) || norm(b.city).includes(q));
    const stateMatch = b.state && b.state.length > 2 && (q.includes(norm(b.state)) || norm(b.state).includes(q));
    const chapMatch = b.chapter && (q.includes(norm(b.chapter)) || norm(b.chapter).includes(q));

    return (
      nameMatch ||
      industryMatch ||
      catMatch ||
      ownerMatch ||
      emailMatch ||
      cityMatch ||
      stateMatch ||
      chapMatch
    );
  });

  // C. Search Businesses (general list or "show businesses")
  const isBusinessesQuery =
    /((show|list|find|search|all|view|registered)\s+.*business)|(\bbusiness(es)?\s+(directory|list)\b)|(^businesses$)|(^business$)/i.test(q);

  if (isBusinessesQuery) {
    // Check if the query is a generic "show all businesses" vs a query filtered by a specific location, chapter, or keyword
    const genericTokens = new Set([
      "show", "list", "find", "search", "all", "view", "registered", "active",
      "business", "businesses", "directory", "me", "the", "a", "an", "of", "and", "in", "chapter", "chapters", "our", "to"
    ]);
    const queryWords = q.split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
    const specificWords = queryWords.filter((w) => !genericTokens.has(w));
    const isGenericBusinessQuery = specificWords.length === 0;

    const targetBusinesses = isGenericBusinessQuery
      ? (liveEntities.businesses || [])
      : matchedBusinesses;

    if (targetBusinesses.length === 0) {
      const noneScope = locationLabel
        ? ` in ${locationLabel}`
        : specificWords.length > 0
        ? ` matching **"${specificWords.join(" ")}"**`
        : "";
      let msg = `### 🏢 Registered Businesses\nNo active businesses currently found${noneScope}.`;
      if (explicitChapterName && directChaptersInQuery.length === 0) {
        msg += `\n\n*(Note: There is currently no registered **${locationLabel}** in the Chamber directory.)*`;
      }
      return msg;
    }

    const locationSuffix = locationLabel ? ` in ${locationLabel}` : "";

    let res = `### 🏢 Active Registered Businesses${locationSuffix} (${targetBusinesses.length})\n\n`;
    targetBusinesses.slice(0, 10).forEach((b) => {
      const verifiedTag = b.isVerified ? " ✓" : "";
      const locationStr = [b.city, b.state].filter(Boolean).join(", ");
      const bizLink = getRoleBusinessLink(effectiveRole, b);
      res += `- [${b.name}](${bizLink}) (${b.industry || "Business"})${verifiedTag}\n`;
      res += `  - Chapter: **${b.chapter || "Chamber"}** | Location: **${locationStr || "National"}**\n`;
      if (b.ownerName) res += `  - Owner: ${b.ownerName} (${b.ownerEmail || ""})\n`;
    });
    if (targetBusinesses.length > 10) {
      res += `\n*...and ${targetBusinesses.length - 10} more businesses in this region.*\n`;
    }

    // Also display regional leadership if available
    if (matchedChapter.length > 0 || matchedChaptersList.length > 0) {
      res += `\n**Regional Leadership & Chapters:**\n`;
      matchedChapter.forEach((a) => {
        res += `- 🏛️ Chapter Admin: **${a.name}** — Chapter: **${a.chapter}** (${a.email})\n`;
      });
      matchedChaptersList.slice(0, 4).forEach((c) => {
        res += `- 📍 Chapter: **${c.name}** (${c.city}, ${c.state})\n`;
      });
    }

    return res.trim();
  }

  // D. Search State Admins (direct question)
  const isStateAdminQuery =
    q.includes("state admin") ||
    q.includes("state_admin") ||
    q.includes("state admins") ||
    q === "states";

  if (isStateAdminQuery) {
    const admins = matchedState.length > 0 ? matchedState : liveEntities.stateAdmins || [];
    if (admins.length === 0) {
      return `### 🏛️ State Administrators\nThere are currently no active State Admins assigned.\n\n👉 Assign or view states: [States Management](${stateRoute})`;
    }
    let res = `### 🏛️ Active State Administrators (${admins.length})\n\n`;
    admins.forEach((a) => {
      res += `- **${a.name}** — State: **${a.state}**\n`;
      res += `  - Email: \`${a.email}\`${a.phone ? ` • Tel: ${a.phone}` : ""}\n`;
    });
    if (matchedBusinesses.length > 0) {
      res += `\n**Registered Businesses in this Region (${matchedBusinesses.length}):**\n`;
      matchedBusinesses.slice(0, 5).forEach((b) => {
        const bizLink = getRoleBusinessLink(effectiveRole, b);
        res += `- 🏢 [${b.name}](${bizLink}) (${b.industry}) — ${b.city || ""}, ${b.state || ""} (Chapter: ${b.chapter || "Chamber"})\n`;
      });
    }
    res += `\n👉 View All States: [States Directory](${stateRoute})`;
    return res;
  }

  // E. Search Chapter Admins (direct question)
  const isChapterAdminQuery =
    q.includes("chapter admin") ||
    q.includes("chapter_admin") ||
    q.includes("chapter admins") ||
    q.includes("chapter leaders");

  if (isChapterAdminQuery) {
    const admins = matchedChapter.length > 0 ? matchedChapter : liveEntities.chapterAdmins || [];
    if (admins.length === 0) {
      return `### 🏛️ Chapter Administrators\nNo active Chapter Admins found.\n\n👉 Manage Chapters: [Chapters Desk](${chapRoute})`;
    }
    let res = `### 🏛️ Active Chapter Administrators (${admins.length})\n\n`;
    admins.forEach((a) => {
      res += `- **${a.name}** — Chapter: **${a.chapter}**${a.state ? ` (${a.state})` : ""}\n`;
      res += `  - Email: \`${a.email}\`${a.phone ? ` • Tel: ${a.phone}` : ""}\n`;
    });
    if (matchedBusinesses.length > 0) {
      res += `\n**Registered Businesses in this Chapter/State (${matchedBusinesses.length}):**\n`;
      matchedBusinesses.slice(0, 5).forEach((b) => {
        const bizLink = getRoleBusinessLink(effectiveRole, b);
        res += `- 🏢 [${b.name}](${bizLink}) (${b.industry}) — ${b.city || ""}, ${b.state || ""} (Chapter: ${b.chapter || "Chamber"})\n`;
      });
    }
    res += `\n👉 Manage Chapters: [Chapters & Units Desk](${chapRoute})`;
    return res;
  }

  // F. Specific Name / Keyword Match across live entities (Admins, Chapters, and Businesses)
  const hasEntityMatches =
    matchedCentral.length > 0 ||
    matchedState.length > 0 ||
    matchedChapter.length > 0 ||
    matchedChaptersList.length > 0 ||
    matchedBusinesses.length > 0;

  if (hasEntityMatches) {
    let res = `Here are the active members, chapters, and registered businesses matching **"${query}"**:\n\n`;

    if (matchedCentral.length > 0) {
      res += `**Central Admins:**\n`;
      matchedCentral.forEach((a) => {
        res += `- 👑 **${a.name}** (${a.email})${effectiveRole === "central_admin" ? " [Manage](/admin/central-admin)" : ""}\n`;
      });
      res += `\n`;
    }

    if (matchedState.length > 0) {
      res += `**State Admins:**\n`;
      matchedState.forEach((a) => {
        res += `- 🏛️ **${a.name}** — State: **${a.state}** (${a.email}) [View States](${stateRoute})\n`;
      });
      res += `\n`;
    }

    if (matchedChapter.length > 0) {
      res += `**Chapter Admins:**\n`;
      matchedChapter.forEach((a) => {
        res += `- 🏛️ **${a.name}** — Chapter: **${a.chapter}**${a.state ? ` (${a.state})` : ""} (${a.email}) [View Chapters](${chapRoute})\n`;
      });
      res += `\n`;
    }

    if (matchedChaptersList.length > 0) {
      res += `**Active Chapters (${matchedChaptersList.length}):**\n`;
      matchedChaptersList.slice(0, 6).forEach((c) => {
        res += `- 📍 **${c.name}** — ${c.city ? `${c.city}, ` : ""}${c.state || "Chamber"}${c.lead ? ` (Lead: ${c.lead})` : ""} [View Chapters](${chapRoute})\n`;
      });
      if (matchedChaptersList.length > 6) {
        res += `*...and ${matchedChaptersList.length - 6} more chapters.*\n`;
      }
      res += `\n`;
    }

    if (matchedBusinesses.length > 0) {
      const titleSuffix = locationLabel ? ` in ${locationLabel}` : "";

      res += `**Registered Businesses${titleSuffix} (${matchedBusinesses.length}):**\n`;
      matchedBusinesses.slice(0, 10).forEach((b) => {
        const verifiedTag = b.isVerified ? " ✓" : "";
        const locationStr = [b.city, b.state].filter(Boolean).join(", ");
        const bizLink = getRoleBusinessLink(effectiveRole, b);
        res += `- 🏢 [${b.name}](${bizLink}) (${b.industry || "Business"})${verifiedTag}\n`;
        res += `  - Chapter: **${b.chapter || "Chamber"}** | Location: **${locationStr || "National"}**${b.ownerName ? ` • Owner: ${b.ownerName}` : ""}\n`;
      });
      if (matchedBusinesses.length > 10) {
        res += `*...and ${matchedBusinesses.length - 10} more registered businesses in this region.*\n`;
      }
    }

    return res.trim();
  }

  // ==========================================
  // 2. FAQ MATCHING
  // ==========================================
  const matchedFaq = faqs.find(
    (f) =>
      f.question.toLowerCase().includes(q) ||
      q.includes(f.question.toLowerCase()) ||
      f.question.toLowerCase().split(" ").some((word) => word.length > 3 && q.includes(word))
  );

  if (matchedFaq) {
    return `${matchedFaq.answer}\n\n👉 Direct link: [${matchedFaq.question}](${matchedFaq.actionLink})`;
  }

  // ==========================================
  // 3. MODULE FEATURE & KEYWORD SCORING
  // ==========================================
  const scores = modules.map((m) => {
    let score = 0;
    const titleMatch = m.title.toLowerCase().includes(q) || q.includes(m.title.toLowerCase());
    if (titleMatch) score += 10;

    const catMatch = m.category.toLowerCase().includes(q);
    if (catMatch) score += 3;

    (m.searchKeywords || []).forEach((kw) => {
      if (q.includes(kw.toLowerCase()) || kw.toLowerCase().includes(q)) score += 5;
    });

    (m.features || []).forEach((feat) => {
      if (feat.toLowerCase().includes(q)) score += 4;
    });

    return { module: m, score };
  });

  scores.sort((a, b) => b.score - a.score);
  const topMatches = scores.filter((s) => s.score > 0).slice(0, 3);

  if (topMatches.length > 0) {
    const primary = topMatches[0].module;
    let response = `Here is what I found in your workspace for **"${query}"**:\n\n`;
    response += `### [${primary.title}](${primary.route})\n`;
    response += `${primary.description}\n\n`;
    if (primary.features?.length) {
      response += `**Available Features:**\n`;
      primary.features.slice(0, 4).forEach((feat) => {
        response += `- ${feat}\n`;
      });
    }

    if (topMatches.length > 1) {
      response += `\n**Related Desks:**\n`;
      topMatches.slice(1).forEach((item) => {
        response += `- [${item.module.title}](${item.module.route}) (${item.module.category})\n`;
      });
    }

    return response;
  }

  // Default fallback if no match
  return `I couldn't find a direct module or member match for **"${query}"** within your role permissions.\n\nYou can search for:\n- Central Admins, State Admins, or Chapter Admins\n- Registered businesses, cities, or industries\n- Features: Verification, Buyer Enquiries, Meetings, Networking Circles, or Membership plans.`;
}

/**
 * Main AI Copilot chat handler
 */
export async function askCopilot({ message, conversationHistory = [], user }) {
  const effectiveRole = normalizeRole(user?.role);

  // Sync live active entities (Central Admins, State Admins, Chapter Admins, Businesses)
  // If an entity was deleted or deactivated, it is automatically purged from the JSON file!
  const liveEntities = await syncLiveEntitiesToFile(true);
  const filteredData = getFilteredContext(effectiveRole, liveEntities);
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  // If no Gemini API key, use immediate smart knowledge base + live entity search
  if (!apiKey) {
    const fallbackText = searchKnowledgeBaseFallback(message, effectiveRole, liveEntities);
    return {
      reply: fallbackText,
      role: effectiveRole,
      isFallback: true,
      note: "Live Database & Knowledge Base Search (Set GEMINI_API_KEY for conversational AI)",
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Construct entity summary prompt for Gemini
    const liveEntitiesPrompt = `
=== CURRENT ACTIVE ORGANIZATIONAL ENTITIES IN RIFAH CONNECT (LIVE DATABASE) ===
Central Admins (${liveEntities?.centralAdmins?.length || 0}):
${(liveEntities?.centralAdmins || []).map((a) => `- ${a.name} (${a.email}) [Role: central_admin]`).join("\n") || "None"}

State Admins (${liveEntities?.stateAdmins?.length || 0}):
${(liveEntities?.stateAdmins || []).map((a) => `- ${a.name} (${a.email}) - State: ${a.state}`).join("\n") || "None currently assigned"}

Chapter Admins (${liveEntities?.chapterAdmins?.length || 0}):
${(liveEntities?.chapterAdmins || []).map((a) => `- ${a.name} (${a.email}) - Chapter: ${a.chapter} (State: ${a.state || "Active"})`).join("\n") || "None"}

Active Chapters (${liveEntities?.chapters?.length || 0}):
${(liveEntities?.chapters || []).map((c) => `- ${c.name} (Location: ${c.city}, ${c.state}) [Lead: ${c.lead || "Secretary"}]`).join("\n") || "None"}

Active Businesses (${liveEntities?.businesses?.length || 0}):
${(liveEntities?.businesses || []).map((b) => `- ${b.name} (${b.industry}) — Location: ${b.city}, ${b.state} | Chapter: ${b.chapter} | Owner: ${b.ownerName} [Route: ${getRoleBusinessLink(effectiveRole, b)}]`).join("\n")}
`;

    const systemPrompt = `
You are the official "RIFAH AI Copilot" for RIFAH Chamber of Commerce (RIFAH Connect portal).
User Profile:
- Name: "${user?.name || "Member"}"
- Role: "${effectiveRole}"
- Chapter: "${user?.chapter || "General"}"
- State: "${user?.state || "National"}"

STRICT PERMISSION & DATA RULES:
1. You have access to BOTH platform feature modules AND current live active entities (Central Admins, State Admins, Chapter Admins, Chapters, and Registered Businesses).
2. Deactivated / Deleted entities: Note that only ACTIVE records exist in your context. If an admin or business does not appear in the context, they do not exist or are deactivated.
3. Under NO circumstances should you reveal, link to, or suggest administration routes or capabilities that belong to a higher role tier than the user's role.
   - For Chapter Admins, State Admins, and Business Owners: If asked about Central Admins or apex leadership, share their name and contact details for chamber coordination, but NEVER provide links or routes to Central Admin desks or management routes (/admin, /admin/central-admin, /admin/users). Do not provide any link when they ask about central admin.
   - For example: if a "business_owner" asks how to delete chapters or approve KYC verifications, explain that these actions require Central/Chapter Admin authorization.
4. Deep Links: Whenever mentioning a page or action, ALWAYS format it as a clickable Markdown link using the exact authorized route provided. Format: [Page Name](route).
   Examples:
   - [Central Admin Portal](/admin)
   - [Chapters Desk](${getRoleChapterLink(effectiveRole)})
   - [Buyer Enquiries](/biz/enquiries)
5. Tone: Professional, courteous, proactive, concise, and focused on chamber trade, collaboration, and networking.
6. MANDATORY STATE & CHAPTER SEARCH REQUIREMENT:
   - When a user searches for or inquires about ANY State, Chapter, or City (such as "maharashtra", "mumbai", "pune", "delhi", "noida", etc.), you MUST ALWAYS present BOTH the regional administration/chapters AND ALL registered businesses located in that state and chapter!
   - Format each business with a markdown link opening its specific profile page: [Business Name](/business/slug-or-id), including their industry, city, state, and chapter. Use the exact [Route: /business/...] provided in the active businesses list.
   - Under NO circumstances should you provide, append, or mention any "View Complete Directory", "View Directory", or general directory links. Only link directly to the specific business profile pages.
   - CRITICAL LOCATION ACCURACY: If the user searches for a Chapter, City, or State that does NOT exist in the Chamber directory (for example, "Dubai Chapter"), or if no businesses are registered in that location, NEVER substitute or dump businesses from other unrelated chapters (such as Mumbai). Clearly state that no chapter or businesses currently exist for that requested location.

${liveEntitiesPrompt}

=== AUTHORIZED MODULES FOR ROLE: ${effectiveRole} ===
${JSON.stringify(filteredData.modules, null, 2)}
`;

    // Map conversation history
    const formattedHistory = [
      { role: "user", parts: [{ text: "Hello assistant." }] },
      {
        role: "model",
        parts: [
          {
            text: `Hello ${user?.name || ""}! I am your RIFAH AI Copilot. How can I assist your ${effectiveRole.replace("_", " ")} workspace today?`,
          },
        ],
      },
    ];

    (conversationHistory || []).slice(-6).forEach((item) => {
      if (item.text || item.content) {
        formattedHistory.push({
          role: item.role === "user" ? "user" : "model",
          parts: [{ text: item.text || item.content }],
        });
      }
    });

    const chat = model.startChat({
      history: formattedHistory,
      systemInstruction: { parts: [{ text: systemPrompt }] },
    });

    const result = await chat.sendMessage(message);
    const replyText = result.response.text();

    return {
      reply: replyText,
      role: effectiveRole,
      isFallback: false,
    };
  } catch (error) {
    console.error("[COPILOT ERROR]", error.message);
    // Graceful fallback on API error
    const fallbackText = searchKnowledgeBaseFallback(message, effectiveRole, liveEntities);
    return {
      reply: `${fallbackText}\n\n*(Note: Gemini live processing encountered an error; served from verified Knowledge Base)*`,
      role: effectiveRole,
      isFallback: true,
      error: error.message,
    };
  }
}
