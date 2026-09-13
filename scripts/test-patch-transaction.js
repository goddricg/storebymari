const mysql = require('mysql2/promise');

async function test() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  const me = { email: 'maripwriter@gmail.com' };
  const isSuperAdminOperator = me.email === "maripwriter@gmail.com";

  // Let's find a regular user to change their role
  const [users] = await connection.query("SELECT * FROM users WHERE email = 'ploysuchada0@gmail.com' LIMIT 1");
  if (users.length === 0) {
    console.log("User ploysuchada0@gmail.com not found!");
    process.exit(1);
  }

  const currentUser = users[0];
  const id = currentUser.id;
  const role = 'admin'; // try to change to admin

  console.log("Simulating PATCH for user:process.env.DB_USERcurrent role:", currentUser.role);

  try {
    await connection.beginTransaction();

    // บังคับให้ Super Admin มีเพียงอีเมล maripwriter@gmail.com เท่านั้น
    const targetRole = role !== undefined ? role : currentUser.role;
    const targetIsAdmin = currentUser.is_admin;
    if (targetRole === 'superadmin' || (targetIsAdmin && !targetRole)) {
      if (currentUser.email !== 'maripwriter@gmail.com') {
        throw new Error("มีเพียงบัญชี maripwriter@gmail.com เท่านั้นที่เป็น Super Admin ได้");
      }
    }

    // ห้ามพนักงาน (admin) แก้ไขข้อมูลผู้ดูแลระบบท่านอื่น (admin หรือ superadmin)
    if (!isSuperAdminOperator) {
      const isTargetAdmin = currentUser.role === 'admin' || currentUser.role === 'superadmin' || currentUser.is_admin === 1;
      if (isTargetAdmin) {
        throw new Error("พนักงานไม่สามารถแก้ไขข้อมูลของผู้ดูแลระบบท่านอื่นได้");
      }
    }

    const finalDisplayName = currentUser.display_name;
    const finalIsActive = currentUser.is_active;
    const finalUserTier = currentUser.user_tier;
    const finalIsApiEnabled = currentUser.is_api_enabled;

    let finalRole = currentUser.role || 'user';
    let finalIsAdmin = currentUser.is_admin;

    if (role !== undefined) {
      finalRole = role;
      finalIsAdmin = (role === 'superadmin' || role === 'admin') ? 1 : 0;
    }

    const finalPoints = Number(currentUser.points ?? 0);
    const now = new Date();

    const isEditingAdmin = finalRole === 'admin' || finalRole === 'superadmin' || finalIsAdmin === 1;

    if (isEditingAdmin && currentUser.email) {
      console.log("Updating using email...");
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
      console.log("Updating using id...");
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

    console.log("Database update query executed successfully!");
    await connection.rollback();
    console.log("Rollback completed.");
  } catch (err) {
    console.error("Error during transaction simulation:", err.message);
    await connection.rollback();
  }

  process.exit(0);
}

test().catch(console.error);
