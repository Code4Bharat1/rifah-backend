const fs = require('fs');
const path = require('path');

const replacements = {
  "src/middleware/role.middleware.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n([\s\S]*?)>>>>>>> Stashed changes/g,
      replace: "$1\n    return next(new ForbiddenError(`Access denied. Requires one of: ${roles.join(\", \")}`));"
    }
  ],
  "src/modules/anniversaries/anniversary.routes.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*requireRole\(\["super_admin", "admin"\]\),\r?\n>>>>>>> Stashed changes/g,
      replace: '  requireRole([ROLES.CENTRAL_ADMIN, "super_admin", "admin"]),'
    }
  ],
  "src/modules/anniversaries/anniversary.service.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const isAdmin = \["super_admin", "admin"\]\.includes\(userDoc\?\.role \|\| currentUser\.role\);\r?\n>>>>>>> Stashed changes/g,
      replace: '    const isAdmin = ["central_admin", "super_admin", "admin"].includes(userDoc?.role || currentUser.role);'
    }
  ],
  "src/modules/birthdays/birthday.routes.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*requireRole\(\["super_admin", "admin"\]\),\r?\n>>>>>>> Stashed changes/g,
      replace: '  requireRole([ROLES.CENTRAL_ADMIN, "super_admin", "admin"]),'
    }
  ],
  "src/modules/birthdays/birthday.service.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const isAdmin = \["super_admin", "admin"\]\.includes\(userDoc\?\.role \|\| currentUser\.role\);\r?\n>>>>>>> Stashed changes/g,
      replace: '    const isAdmin = ["central_admin", "super_admin", "admin"].includes(userDoc?.role || currentUser.role);'
    }
  ],
  "src/modules/businesses/business.service.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const isAdmin = \["super_admin", "admin"\]\.includes\(user\.role\);\r?\n>>>>>>> Stashed changes/g,
      replace: '    const isAdmin = ["central_admin", "super_admin", "admin"].includes(user.role);'
    },
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const isAdmin = \["super_admin", "admin"\]\.includes\(effectiveRole\);\r?\n>>>>>>> Stashed changes/g,
      replace: '    const isAdmin = ["central_admin", "super_admin", "admin"].includes(effectiveRole);'
    }
  ],
  "src/modules/catalogue/catalogue.service.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const isAdmin = \["super_admin", "admin"\]\.includes\(user\.role\);\r?\n>>>>>>> Stashed changes/g,
      replace: '    const isAdmin = ["central_admin", "super_admin", "admin"].includes(user.role);'
    }
  ],
  "src/modules/enquiries/enquiry.service.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const isAdmin = \["super_admin", "admin", "state_admin", "chapter_admin"\]\.includes\(user\.role\);\r?\n>>>>>>> Stashed changes/g,
      replace: '      const isAdmin = ["central_admin", "super_admin", "admin", "state_admin", "chapter_admin"].includes(user.role);'
    }
  ],
  "src/modules/events/event.service.js": [
    {
      find: /<<<<<<< Updated upstream\r?\n\s*if \(user && user\.role !== ROLES\.CENTRAL_ADMIN && user\.role !== ROLES\.SECRETARIAT\) \{\r?\n=======\r?\n\s*if \(user && user\.role !== ROLES\.SUPER_ADMIN && user\.role !== "admin"\) \{\r?\n>>>>>>> Stashed changes/g,
      replace: '    if (user && user.role !== ROLES.CENTRAL_ADMIN && user.role !== ROLES.SECRETARIAT && user.role !== ROLES.SUPER_ADMIN && user.role !== "admin") {'
    },
    {
      find: /<<<<<<< Updated upstream\r?\n\s*if \(user && user\.role !== ROLES\.CENTRAL_ADMIN\) \{\r?\n=======\r?\n\s*if \(user && user\.role !== ROLES\.SUPER_ADMIN && user\.role !== "admin"\) \{\r?\n>>>>>>> Stashed changes/g,
      replace: '    if (user && user.role !== ROLES.CENTRAL_ADMIN && user.role !== ROLES.SUPER_ADMIN && user.role !== "admin") {'
    }
  ],
  "src/modules/leads/lead.service.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*\} else if \(user && \[ "central_admin", "super_admin", "admin" \]\.includes\(user\.role\)\) \{\r?\n>>>>>>> Stashed changes/g,
      replace: '    } else if (user && [ "central_admin", "secretariat", "super_admin", "admin" ].includes(user.role)) {'
    },
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const isAdmin = \["central_admin", "super_admin", "admin", "state_admin", "chapter_admin"\]\.includes\(user\.role\);\r?\n>>>>>>> Stashed changes/g,
      replace: '      const isAdmin = ["central_admin", "secretariat", "super_admin", "admin", "state_admin", "chapter_admin"].includes(user.role);'
    },
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const isAdmin = \["central_admin", "super_admin", "admin", "state_admin", "chapter_admin"\]\.includes\(user\.role\);\r?\n>>>>>>> Stashed changes/g,
      replace: '    const isAdmin = ["central_admin", "secretariat", "super_admin", "admin", "state_admin", "chapter_admin"].includes(user.role);'
    }
  ],
  "src/modules/reports/report.service.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*\} else if \(r === "chapter_admin" \|\| r === "state_admin" \|\| r === "central_admin" \|\| r === "super_admin" \|\| r === "admin"\) \{\r?\n>>>>>>> Stashed changes/g,
      replace: '            } else if (r === "chapter_admin" || r === "state_admin" || r === "central_admin" || r === "super_admin" || r === "admin") {'
    }
  ],
  "src/modules/users/user.service.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*if \(userToUpdate\.role === ROLES\.CENTRAL_ADMIN \|\| userToUpdate\.role === "super_admin" \|\| userToUpdate\.role === "admin" \|\| userToUpdate\.role === ROLES\.STATE_ADMIN\) \{\r?\n>>>>>>> Stashed changes/g,
      replace: '      if (userToUpdate.role === ROLES.CENTRAL_ADMIN || userToUpdate.role === "super_admin" || userToUpdate.role === "admin" || userToUpdate.role === ROLES.STATE_ADMIN) {'
    },
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const isAuthorized = \[ROLES\.CENTRAL_ADMIN, "super_admin", "admin", ROLES\.STATE_ADMIN, ROLES\.CHAPTER_ADMIN\]\.includes\(requester\.role\);\r?\n\s*if \(!isAuthorized\) \{\r?\n>>>>>>> Stashed changes/g,
      replace: '    const isAuthorized = [ROLES.CENTRAL_ADMIN, "super_admin", "admin", ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(requester.role);\n    if (!isAuthorized) {'
    }
  ],
  "src/modules/users/user.validation.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*const allowedRoles = \["customer", "business_owner", "chapter_admin", "state_admin", "central_admin", "super_admin", "admin"\];\r?\n>>>>>>> Stashed changes/g,
      replace: '    const allowedRoles = ["customer", "business_owner", "chapter_admin", "state_admin", "central_admin", "super_admin", "admin"];'
    }
  ],
  "src/shared/constants/roles.js": [
    {
      find: /<<<<<<< Updated upstream\r?\n=======\r?\n\s*SUPER_ADMIN: "central_admin", \/\/ alias for backwards compatibility\r?\n\s*ADMIN: "central_admin", \/\/ alias for backwards compatibility\r?\n>>>>>>> Stashed changes/g,
      replace: '  SUPER_ADMIN: "central_admin", // alias for backwards compatibility\n  ADMIN: "central_admin", // alias for backwards compatibility'
    },
    {
      find: /<<<<<<< Updated upstream\r?\n=======\r?\n\s*super_admin: 100,\r?\n\s*admin: 100,\r?\n>>>>>>> Stashed changes/g,
      replace: '  super_admin: 100,\n  admin: 100,'
    }
  ],
  "src/shared/utils/chapter-scope.js": [
    {
      find: /<<<<<<< Updated upstream[\s\S]*?=======\r?\n\s*\/\/ Central Admins have unrestricted access\r?\n\s*if \(user\.role === ROLES\.CENTRAL_ADMIN \|\| user\.role === "super_admin" \|\| user\.role === "admin"\) \{\r?\n>>>>>>> Stashed changes/g,
      replace: '  // Central Admins have unrestricted access\n  if (user.role === ROLES.CENTRAL_ADMIN || user.role === "super_admin" || user.role === "admin") {'
    }
  ]
};

for (const [file, rules] of Object.entries(replacements)) {
  const filepath = path.join(__dirname, file);
  if (fs.existsSync(filepath)) {
    let content = fs.readFileSync(filepath, 'utf8');
    let changed = false;
    for (const rule of rules) {
      if (rule.find.test(content)) {
        content = content.replace(rule.find, rule.replace);
        changed = true;
      }
    }
    
    // Fallback: If any markers are still there, replace them aggressively by taking the Stashed version
    const fallbackFind = /<<<<<<< Updated upstream[\s\S]*?=======\r?\n([\s\S]*?)>>>>>>> Stashed changes/g;
    if (fallbackFind.test(content)) {
        content = content.replace(fallbackFind, "$1");
        changed = true;
    }

    if (changed) {
      fs.writeFileSync(filepath, content);
      console.log('Fixed ' + file);
    } else {
      console.log('No matches found for ' + file);
    }
  }
}
