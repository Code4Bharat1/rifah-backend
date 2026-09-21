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
  // Central admin sees all entities
  // State admin sees state-relevant entities + directory
  // Chapter admin sees chapter-relevant entities + directory
  // Business owner sees chamber chapter admins & businesses directory
  let filteredEntities = {
    centralAdmins: liveEntities?.centralAdmins || [],
    stateAdmins: liveEntities?.stateAdmins || [],
    chapterAdmins: liveEntities?.chapterAdmins || [],
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

  // ==========================================
  // 1. DYNAMIC ENTITY SEARCH (Admins & Businesses)
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
      return `### 👑 Central Administrators\nNo active Central Admin found in the active records.\n\n👉 Access: [Central Admin Portal](/admin)`;
    }
    let res = `### 👑 Active Central Administrators (${admins.length})\n\n`;
    admins.forEach((a) => {
      res += `- **${a.name}** (${a.email})${a.phone ? ` • Tel: ${a.phone}` : ""}\n`;
      res += `  - Role: \`Central Administrator\` | Status: \`${a.status}\`\n`;
    });
    res += `\n👉 Manage Admins: [Central Admin Desk](/admin/central-admin) | [User Management](/admin/users)`;
    return res;
  }

  // B. Search State Admins
  const isStateAdminQuery =
    q.includes("state admin") ||
    q.includes("state_admin") ||
    q.includes("state admins") ||
    q === "states";

  if (isStateAdminQuery) {
    const admins = liveEntities.stateAdmins || [];
    if (admins.length === 0) {
      return `### 🏛️ State Administrators\nThere are currently no active State Admins assigned.\n\n👉 Assign or view states: [States Management](/admin/states)`;
    }
    let res = `### 🏛️ Active State Administrators (${admins.length})\n\n`;
    admins.forEach((a) => {
      res += `- **${a.name}** — State: **${a.state}**\n`;
      res += `  - Email: \`${a.email}\`${a.phone ? ` • Tel: ${a.phone}` : ""}\n`;
    });
    res += `\n👉 View All States: [States Directory](/admin/states) | [State Admin Desk](/state-admin)`;
    return res;
  }

  // C. Search Chapter Admins
  const isChapterAdminQuery =
    q.includes("chapter admin") ||
    q.includes("chapter_admin") ||
    q.includes("chapter admins") ||
    q.includes("chapter leaders");

  if (isChapterAdminQuery) {
    const admins = liveEntities.chapterAdmins || [];
    if (admins.length === 0) {
      return `### 🏛️ Chapter Administrators\nNo active Chapter Admins found.\n\n👉 Manage Chapters: [Chapters Desk](/admin/chapters)`;
    }
    let res = `### 🏛️ Active Chapter Administrators (${admins.length})\n\n`;
    admins.forEach((a) => {
      res += `- **${a.name}** — Chapter: **${a.chapter}**${a.state ? ` (${a.state})` : ""}\n`;
      res += `  - Email: \`${a.email}\`${a.phone ? ` • Tel: ${a.phone}` : ""}\n`;
    });
    res += `\n👉 Manage Chapters: [Chapters & Units Desk](/admin/chapters) | [Chapter Operations](/chapter-admin/operations)`;
    return res;
  }

  // D. Search Businesses (general list or "show businesses")
  const isBusinessesQuery =
    /((show|list|find|search|all|view|registered)\s+.*business)|(\bbusiness(es)?\s+(directory|list)\b)|(^businesses$)|(^business$)/i.test(q);

  if (isBusinessesQuery) {
    const bizs = liveEntities.businesses || [];
    if (bizs.length === 0) {
      return `### 🏢 Registered Businesses\nNo active businesses currently found.\n\n👉 Register a business: [Register Business](/biz/profile) | [Admin Businesses](/admin/businesses)`;
    }
    let res = `### 🏢 Active Registered Businesses (${bizs.length})\n\n`;
    bizs.slice(0, 10).forEach((b) => {
      res += `- **${b.name}** (${b.industry || "Business"})\n`;
      res += `  - Chapter: **${b.chapter || "Chamber"}** | Location: **${b.city || ""}, ${b.state || ""}**\n`;
      if (b.ownerName) res += `  - Owner: ${b.ownerName} (${b.ownerEmail || ""})\n`;
    });
    if (bizs.length > 10) {
      res += `\n*...and ${bizs.length - 10} more businesses.*\n`;
    }
    const dirRoute = role === "central_admin" ? "/admin/businesses" : "/biz/directory";
    res += `\n👉 View Complete Directory: [Business Directory](${dirRoute})`;
    return res;
  }

  // E. Specific Name / Keyword Match across live entities (Admins and Businesses)
  const matchedCentral = (liveEntities.centralAdmins || []).filter(
    (a) =>
      (a.name && (q.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(q))) ||
      (a.email && (q.includes(a.email.toLowerCase()) || a.email.toLowerCase().includes(q)))
  );
  const matchedState = (liveEntities.stateAdmins || []).filter(
    (a) =>
      (a.name && (q.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(q))) ||
      (a.email && (q.includes(a.email.toLowerCase()) || a.email.toLowerCase().includes(q))) ||
      (a.state && a.state.length > 2 && (q.includes(a.state.toLowerCase()) || a.state.toLowerCase().includes(q)))
  );
  const matchedChapter = (liveEntities.chapterAdmins || []).filter(
    (a) =>
      (a.name && (q.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(q))) ||
      (a.email && (q.includes(a.email.toLowerCase()) || a.email.toLowerCase().includes(q))) ||
      (a.chapter && (q.includes(a.chapter.toLowerCase()) || a.chapter.toLowerCase().includes(q))) ||
      (a.state && a.state.length > 2 && (q.includes(a.state.toLowerCase()) || a.state.toLowerCase().includes(q)))
  );
  const matchedBusinesses = (liveEntities.businesses || []).filter(
    (b) =>
      (b.name && (q.includes(b.name.toLowerCase()) || b.name.toLowerCase().includes(q))) ||
      (b.industry && (q.includes(b.industry.toLowerCase()) || b.industry.toLowerCase().includes(q))) ||
      (b.city && b.city.length > 2 && (q.includes(b.city.toLowerCase()) || b.city.toLowerCase().includes(q))) ||
      (b.ownerName && b.ownerName.length > 2 && (q.includes(b.ownerName.toLowerCase()) || b.ownerName.toLowerCase().includes(q)))
  );

  const hasEntityMatches =
    matchedCentral.length > 0 ||
    matchedState.length > 0 ||
    matchedChapter.length > 0 ||
    matchedBusinesses.length > 0;

  if (hasEntityMatches) {
    let res = `Here are the active members and organizations matching **"${query}"**:\n\n`;

    if (matchedCentral.length > 0) {
      res += `**Central Admins:**\n`;
      matchedCentral.forEach((a) => {
        res += `- 👑 **${a.name}** (${a.email}) [Manage](/admin/central-admin)\n`;
      });
      res += `\n`;
    }

    if (matchedState.length > 0) {
      res += `**State Admins:**\n`;
      matchedState.forEach((a) => {
        res += `- 🏛️ **${a.name}** — State: **${a.state}** (${a.email}) [View States](/admin/states)\n`;
      });
      res += `\n`;
    }

    if (matchedChapter.length > 0) {
      res += `**Chapter Admins:**\n`;
      matchedChapter.forEach((a) => {
        res += `- 🏛️ **${a.name}** — Chapter: **${a.chapter}** (${a.email}) [View Chapters](/admin/chapters)\n`;
      });
      res += `\n`;
    }

    if (matchedBusinesses.length > 0) {
      res += `**Businesses (${matchedBusinesses.length}):**\n`;
      matchedBusinesses.slice(0, 6).forEach((b) => {
        const link = role === "central_admin" ? "/admin/businesses" : "/biz/directory";
        res += `- 🏢 **[${b.name}](${link})** (${b.industry}) — ${b.city || ""}, ${b.state || ""} (Chapter: ${b.chapter || "Chamber"})\n`;
      });
      res += `\n`;
    }

    return res;
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
  const liveEntities = await syncLiveEntitiesToFile();
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

Active Businesses (${liveEntities?.businesses?.length || 0}):
${(liveEntities?.businesses || []).slice(0, 25).map((b) => `- ${b.name} (${b.industry}) — Location: ${b.city}, ${b.state} | Chapter: ${b.chapter} | Owner: ${b.ownerName} [Route: /biz/directory]`).join("\n")}
`;

    const systemPrompt = `
You are the official "RIFAH AI Copilot" for RIFAH Chamber of Commerce (RIFAH Connect portal).
User Profile:
- Name: "${user?.name || "Member"}"
- Role: "${effectiveRole}"
- Chapter: "${user?.chapter || "General"}"
- State: "${user?.state || "National"}"

STRICT PERMISSION & DATA RULES:
1. You have access to BOTH platform feature modules AND current live active entities (Central Admins, State Admins, Chapter Admins, and Registered Businesses).
2. Deactivated / Deleted entities: Note that only ACTIVE records exist in your context. If an admin or business does not appear in the context, they do not exist or are deactivated.
3. Under NO circumstances should you reveal, link to, or suggest administration routes or capabilities that belong to a higher role tier than the user's role.
   - For example: if a "business_owner" asks how to delete chapters or approve KYC verifications, explain that these actions require Central/Chapter Admin authorization.
4. Deep Links: Whenever mentioning a page, action, or directory, ALWAYS format it as a clickable Markdown link using the exact authorized route provided. Format: [Page Name](route).
   Examples:
   - [Central Admin Portal](/admin)
   - [Chapters Desk](/admin/chapters)
   - [Business Directory](/biz/directory)
   - [Buyer Enquiries](/biz/enquiries)
5. Tone: Professional, courteous, proactive, concise, and focused on chamber trade, collaboration, and networking.

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
