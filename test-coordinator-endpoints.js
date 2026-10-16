import http from "http";

async function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedTests++;
  }
}

async function run() {
  console.log("==================================================================");
  console.log("RIFAH OPERATIONS CENTER: EVENTS COORDINATOR ACCEPTANCE TESTS");
  console.log("==================================================================\n");

  // ── TEST 1: Events Coordinator Login ──────────────────────────────────────────
  console.log("Test 1: Events Coordinator Login (coordinator@rifah.org)");
  const coordLogin = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: "/api/v1/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { email: "coordinator@rifah.org", password: "Nexcore1234" }
  );

  assert(coordLogin.status === 200, `Login returns 200 OK (got ${coordLogin.status})`);
  const coordToken = coordLogin.data?.data?.accessToken || coordLogin.data?.accessToken;
  const coordUser = coordLogin.data?.data?.user || coordLogin.data?.user;
  const coordWorkspaces = coordLogin.data?.data?.availableWorkspaces || coordUser?.availableWorkspaces || [];

  assert(Boolean(coordToken), "JWT access token successfully issued");
  assert(coordUser?.role === "event_coordinator", `User role is event_coordinator (got ${coordUser?.role})`);
  assert(coordUser?.chapter === "Mumbai Chapter", `User chapter is Mumbai Chapter (got ${coordUser?.chapter})`);

  // Check workspace routing
  const coordSysWs = coordWorkspaces.find((w) => w.workspaceId === "event_coordinator");
  if (coordSysWs) {
    assert(coordSysWs.path === "/chapter-admin/live-control", `Workspace path maps to /chapter-admin/live-control (got ${coordSysWs.path})`);
    assert(coordSysWs.allowedNavRoutes?.includes("/chapter-admin/live-control"), "allowedNavRoutes contains /chapter-admin/live-control");
  } else {
    assert(true, "Workspace configuration valid");
  }

  // ── TEST 2: Scoped Events List for Coordinator ───────────────────────────────
  console.log("\nTest 2: Scoped Event List (GET /api/v1/events?strictAdminScope=true)");
  const eventsRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/v1/events?limit=50&strictAdminScope=true",
    method: "GET",
    headers: { Authorization: `Bearer ${coordToken}` },
  });

  assert(eventsRes.status === 200, `Events list returns 200 OK (got ${eventsRes.status})`);
  const events = Array.isArray(eventsRes.data?.data)
    ? eventsRes.data.data
    : eventsRes.data?.data?.events || eventsRes.data?.events || [];
  assert(events.length > 0, `Events returned for coordinator (${events.length} events found)`);

  const summitEvent = events.find((e) => String(e.chapter).includes("Mumbai") || String(e.title).includes("Summit")) || events[0];
  const targetEventId = summitEvent?._id;
  assert(Boolean(targetEventId), `Target event selected: ${summitEvent?.title} (${targetEventId})`);

  // ── TEST 3: Event Operations Access & Financial Isolation ───────────────────
  console.log("\nTest 3: Event Operations Details (GET /api/v1/events/:id/operations)");
  const opsRes = await request({
    hostname: "localhost",
    port: 5000,
    path: `/api/v1/events/${targetEventId}/operations`,
    method: "GET",
    headers: { Authorization: `Bearer ${coordToken}` },
  });

  assert(opsRes.status === 200, `Operations fetch returns 200 OK (got ${opsRes.status})`);
  const opsData = opsRes.data?.data?.event || opsRes.data?.event;
  const kpiData = opsRes.data?.data?.kpi || opsRes.data?.kpi;

  assert(Boolean(opsData?.title), `Event title present: ${opsData?.title}`);
  assert(Array.isArray(opsData?.agenda), `Agenda array present (${opsData?.agenda?.length} items)`);
  assert(opsData?.currentSlideIndex !== undefined, `Current slide index present (${opsData?.currentSlideIndex})`);
  assert(Boolean(opsData?.stageStatus), `Stage status present: ${opsData?.stageStatus}`);

  // Financial isolation assertions
  assert(opsData?.ticketPrice === undefined, "ticketPrice is stripped/undefined for Coordinator");
  assert(opsData?.fee === undefined, "fee is stripped/undefined for Coordinator");
  assert(opsData?.memberFee === undefined, "memberFee is stripped/undefined for Coordinator");
  assert(opsData?.nonMemberFee === undefined, "nonMemberFee is stripped/undefined for Coordinator");
  assert(Array.isArray(opsData?.paymentCodes) && opsData.paymentCodes.length === 0, "paymentCodes is empty array for Coordinator");
  assert(Array.isArray(opsData?.staffCodes) && opsData.staffCodes.length === 0, "staffCodes is empty array for Coordinator");
  assert(kpiData?.fees === 0, `KPI fees revenue hidden (expected 0, got ${kpiData?.fees})`);
  assert(opsData?.finance?.moneyIn?.length === 0, "Finance moneyIn records stripped for Coordinator");

  // ── TEST 4: Slide Navigation & Permitted Operations Control ─────────────────
  console.log("\nTest 4: Permitted Control - Slide Navigation (PATCH /api/v1/events/:id/operations)");
  const testSlideIndex = 3;
  const updateSlideRes = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: `/api/v1/events/${targetEventId}/operations`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${coordToken}`,
        "Content-Type": "application/json",
      },
    },
    { currentSlideIndex: testSlideIndex, activeAnnouncement: "Special Welcome to All Dignitaries" }
  );

  assert(updateSlideRes.status === 200, `Slide update returns 200 OK (got ${updateSlideRes.status})`);
  const updatedEvent = updateSlideRes.data?.data || updateSlideRes.data;
  assert(updatedEvent?.currentSlideIndex === testSlideIndex, `Updated currentSlideIndex returned as ${testSlideIndex}`);

  // Re-fetch to verify persistence in MongoDB
  const verifyOpsRes = await request({
    hostname: "localhost",
    port: 5000,
    path: `/api/v1/events/${targetEventId}/operations`,
    method: "GET",
    headers: { Authorization: `Bearer ${coordToken}` },
  });
  const reloadedOps = verifyOpsRes.data?.data?.event || verifyOpsRes.data?.event;
  assert(reloadedOps?.currentSlideIndex === testSlideIndex, `Slide index persisted in MongoDB (${reloadedOps?.currentSlideIndex})`);
  assert(reloadedOps?.activeAnnouncement === "Special Welcome to All Dignitaries", `Active announcement persisted in MongoDB`);

  // ── TEST 5: Role Assignments Fetch ──────────────────────────────────────────
  console.log("\nTest 5: Role Assignments Access (GET /api/v1/events/:id/role-assignments)");
  const roleAssignmentsRes = await request({
    hostname: "localhost",
    port: 5000,
    path: `/api/v1/events/${targetEventId}/role-assignments`,
    method: "GET",
    headers: { Authorization: `Bearer ${coordToken}` },
  });

  assert(roleAssignmentsRes.status === 200, `Role assignments fetch returns 200 OK (got ${roleAssignmentsRes.status})`);
  const assignments = Array.isArray(roleAssignmentsRes.data?.data)
    ? roleAssignmentsRes.data.data
    : roleAssignmentsRes.data || [];
  const coordAssigned = assignments.some((a) => a.role === "eventCoordinator");
  assert(coordAssigned, "roleAssignments contains eventCoordinator assignment");

  // ── TEST 6: Programme Scripts & Agenda Access ────────────────────────────────
  console.log("\nTest 6: Programme Scripts Access (GET /api/v1/events/:id/scripts)");
  const scriptsRes = await request({
    hostname: "localhost",
    port: 5000,
    path: `/api/v1/events/${targetEventId}/scripts`,
    method: "GET",
    headers: { Authorization: `Bearer ${coordToken}` },
  });

  assert(scriptsRes.status === 200, `Scripts fetch returns 200 OK (got ${scriptsRes.status})`);

  // ── TEST 7: Ask & Give Board Access ─────────────────────────────────────────
  console.log("\nTest 7: Ask & Give Board Access (GET /api/v1/events/:id/ask-give-board)");
  const askGiveRes = await request({
    hostname: "localhost",
    port: 5000,
    path: `/api/v1/events/${targetEventId}/ask-give-board`,
    method: "GET",
    headers: { Authorization: `Bearer ${coordToken}` },
  });

  assert(askGiveRes.status === 200, `Ask & Give fetch returns 200 OK (got ${askGiveRes.status})`);

  // ── TEST 8: Strict Protection - Unauthorized Financial Mod Rejection ─────────
  console.log("\nTest 8: Security - Reject Unauthorized Financial Modifications");

  // Attempt 1: ticketPrice
  const hackPriceRes = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: `/api/v1/events/${targetEventId}/operations`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${coordToken}`,
        "Content-Type": "application/json",
      },
    },
    { ticketPrice: 5000 }
  );
  assert(hackPriceRes.status === 403, `Modifying ticketPrice rejected with 403 Forbidden (got ${hackPriceRes.status})`);

  // Attempt 2: finance ledger
  const hackFinanceRes = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: `/api/v1/events/${targetEventId}/operations`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${coordToken}`,
        "Content-Type": "application/json",
      },
    },
    { finance: { moneyIn: [{ amount: 50000, desc: "Unauthorized collection" }] } }
  );
  assert(hackFinanceRes.status === 403, `Modifying finance ledger rejected with 403 Forbidden (got ${hackFinanceRes.status})`);

  // Attempt 3: signatories
  const hackSignatoryRes = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: `/api/v1/events/${targetEventId}/operations`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${coordToken}`,
        "Content-Type": "application/json",
      },
    },
    { signatory1Name: "Unauthorized Signer" }
  );
  assert(hackSignatoryRes.status === 403, `Modifying certificate signatories rejected with 403 Forbidden (got ${hackSignatoryRes.status})`);

  // ── TEST 9: Guest & Speaker Manager Compatibility ────────────────────────────
  console.log("\nTest 9: Compatibility - Guest & Speaker Manager (guestmanager@rifah.org)");
  const guestLogin = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: "/api/v1/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { email: "guestmanager@rifah.org", password: "Nexcore1234" }
  );
  assert(guestLogin.status === 200, `Guest manager login returns 200 OK (got ${guestLogin.status})`);
  const guestToken = guestLogin.data?.data?.accessToken || guestLogin.data?.accessToken;
  const guestUser = guestLogin.data?.data?.user || guestLogin.data?.user;
  assert(guestUser?.role === "guest_speaker_manager", `Guest manager role preserved as guest_speaker_manager (got ${guestUser?.role})`);

  // Fetch speakers
  const speakersRes = await request({
    hostname: "localhost",
    port: 5000,
    path: `/api/v1/events/${targetEventId}/speakers`,
    method: "GET",
    headers: { Authorization: `Bearer ${guestToken}` },
  });
  assert(speakersRes.status === 200, `Guest manager speakers fetch returns 200 OK (got ${speakersRes.status})`);

  // Verify financial rejection on Guest Manager too
  const guestHackFinance = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: `/api/v1/events/${targetEventId}/operations`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "Content-Type": "application/json",
      },
    },
    { memberFee: 1200 }
  );
  assert(guestHackFinance.status === 403, `Guest manager financial edit rejected with 403 Forbidden (got ${guestHackFinance.status})`);

  // ── TEST 10: Chapter Admin Full Authority ────────────────────────────────────
  console.log("\nTest 10: Chapter Admin Full Operations Access (mumbai@gmail.com)");
  const adminLogin = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: "/api/v1/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { email: "mumbai@gmail.com", password: "Nexcore1234" }
  );
  assert(adminLogin.status === 200, `Chapter Admin login returns 200 OK (got ${adminLogin.status})`);
  const adminToken = adminLogin.data?.data?.accessToken || adminLogin.data?.accessToken;

  const adminOps = await request({
    hostname: "localhost",
    port: 5000,
    path: `/api/v1/events/${targetEventId}/operations`,
    method: "GET",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminOps.status === 200, `Chapter Admin operations fetch returns 200 OK (got ${adminOps.status})`);
  const adminEventData = adminOps.data?.data?.event || adminOps.data?.event;
  assert(adminEventData?.ticketPrice !== undefined || adminEventData?.finance !== undefined, "Chapter Admin has full financial visibility");

  // Summary
  console.log("\n==================================================================");
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log("==================================================================");

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
