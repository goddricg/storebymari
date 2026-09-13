const mysql = require('mysql2/promise');

async function simulatePatch(targetEmail, newRole) {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  try {
    // 1. Get operator (me)
    const [meRows] = await connection.query("SELECT * FROM users WHERE email = 'maripwriter@gmail.com' LIMIT 1");
    const me = meRows[0];
    const isSuperAdminOperator = me.email === "maripwriter@gmail.com";

    // 2. Get target user
    const [targetRows] = await connection.query("SELECT * FROM users WHERE email = ? LIMIT 1", [targetEmail]);
    if (targetRows.length === 0) {
      console.log(`Target user ${targetEmail} not found!`);
      return;
    }
    const currentUser = targetRows[0];
    const id = currentUser.id;

    // 3. Simulate validation checks
    // Check targetRole & targetIsAdmin
    const targetRole = newRole !== undefined ? newRole : currentUser.role;
    const targetIsAdmin = currentUser.is_admin;
    if (targetRole === 'superadmin' || (targetIsAdmin && !targetRole)) {
      if (currentUser.email !== 'maripwriter@gmail.com') {
        console.log("Validation Failed: มีเพียงบัญชี maripwriter@gmail.com เท่านั้นที่เป็น Super Admin ได้");
        return;
      }
    }

    if (!isSuperAdminOperator) {
      const isTargetAdmin = currentUser.role === 'admin' || currentUser.role === 'superadmin' || currentUser.is_admin === 1;
      if (isTargetAdmin) {
        console.log("Validation Failed: พนักงานไม่สามารถแก้ไขข้อมูลของผู้ดูแลระบบท่านอื่นได้");
        return;
      }
    }

    let finalRole = currentUser.role || 'user';
    let finalIsAdmin = currentUser.is_admin;

    if (newRole !== undefined) {
      finalRole = newRole;
      finalIsAdmin = (newRole === 'superadmin' || newRole === 'admin') ? 1 : 0;
    }

    if (!isSuperAdminOperator && (finalRole === 'superadmin' || (finalIsAdmin === 1 && finalRole !== 'admin'))) {
      console.log("Validation Failed: พนักงานไม่สามารถตั้งซูเปอร์แอดมินได้");
      return;
    }

    const finalDisplayName = currentUser.display_name;
    const finalIsActive = currentUser.is_active;
    const finalUserTier = currentUser.user_tier;
    const finalIsApiEnabled = currentUser.is_api_enabled;
    const finalPoints = Number(currentUser.points ?? 0);
    const now = new Date();

    const isEditingAdmin = finalRole === 'admin' || finalRole === 'superadmin' || finalIsAdmin === 1;

    await connection.beginTransaction();

    if (isEditingAdmin && currentUser.email) {
      await connection.execute(
        `UPDATE users 
         SET display_name = ?, is_admin = ?, role = ?, is_active = ?, points = ?, user_tier = ?, is_api_enabled = ?, updated_at = ? 
         WHERE email = ?`,
        [
          finalDisplayName,
          finalIsAdmin,
          finalRole,
          finalIsActive,
          finalPoints,
          finalUserTier,
          finalIsApiEnabled,
          now,
          currentUser.email
        ]
      );
    } else {
      await connection.execute(
        `UPDATE users 
         SET display_name = ?, is_admin = ?, role = ?, is_active = ?, points = ?, user_tier = ?, is_api_enabled = ?, updated_at = ? 
         WHERE id = ?`,
        [
          finalDisplayName,
          finalIsAdmin,
          finalRole,
          finalIsActive,
          finalPoints,
          finalUserTier,
          finalIsApiEnabled,
          now,
          id
        ]
      );
    }

    await connection.commit();
    console.log(`Successfully updated ${targetEmail} role to ${newRole}`);
  } catch (err) {
    console.error("Error during PATCH simulation:", err.message);
    await connection.rollback();
  } finally {
    await connection.end();
  }
}

async function runTests() {
  // Test 1: Change ploysuchada0@gmail.com (user) to admin
  console.log("Test 1: User to Admin");
  await simulatePatch('ploysuchada0@gmail.com', 'admin');
  
  // Test 2: Change ploysuchada0@gmail.com back to user
  console.log("\nTest 2: Admin back to User");
  await simulatePatch('ploysuchada0@gmail.com', 'user');
}

runTests().catch(console.error);
