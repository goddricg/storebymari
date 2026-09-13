import assert from "node:assert/strict";
import test from "node:test";

import {
  canAssignSuperAdminRole,
  canViewAdminReports,
  isAdminUser,
  isLocalDemoAuthEnabled,
  isSuperAdminManagementOperator,
  isSuperAdminUser,
} from "../src/lib/auth/roles";

test("only superadmin users can access restricted admin reports", () => {
  assert.equal(isSuperAdminUser({ role: "superadmin", isAdmin: true }), true);
  assert.equal(isSuperAdminUser({ role: "admin", isAdmin: true }), false);
  assert.equal(isSuperAdminUser({ role: "user", isAdmin: false }), false);
  assert.equal(isSuperAdminUser({ role: undefined, isAdmin: true }), true);
  assert.equal(isSuperAdminUser(null), false);
  assert.equal(isAdminUser({ role: "admin", isAdmin: true }), true);
  assert.equal(isAdminUser({ role: "user", isAdmin: false }), false);
  assert.equal(canViewAdminReports("main", { role: "superadmin", isAdmin: true }), true);
  assert.equal(canViewAdminReports("main", { role: "admin", isAdmin: true }), false);
  assert.equal(canViewAdminReports("child1", { role: "admin", isAdmin: true }), true);
  assert.equal(canViewAdminReports("child1", { role: "user", isAdmin: false }), false);
});

test("the local Owner policy is limited to the dedicated development database", () => {
  const localDemo = {
    NODE_ENV: "development",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3307",
    DB_NAME: "storebymari_demo",
  };

  assert.equal(isLocalDemoAuthEnabled(localDemo), true);
  assert.equal(
    isSuperAdminManagementOperator(
      { email: "owner@example.test", role: "superadmin" },
      localDemo,
    ),
    true,
  );
  assert.equal(
    isSuperAdminManagementOperator(
      { email: "staff@example.test", role: "admin" },
      localDemo,
    ),
    false,
  );
  assert.equal(canAssignSuperAdminRole("another-owner@example.test", localDemo), true);
  assert.equal(
    isSuperAdminManagementOperator(
      { email: "staff@example.test", role: "user" },
      localDemo,
    ),
    false,
  );

  const unsafeEnvironments = [
    { ...localDemo, NODE_ENV: "production" },
    { ...localDemo, DB_HOST: "localhost" },
    { ...localDemo, DB_HOST: "0.0.0.0" },
    { ...localDemo, DB_PORT: "3306" },
    { ...localDemo, DB_NAME: "production" },
  ];

  for (const env of unsafeEnvironments) {
    assert.equal(isLocalDemoAuthEnabled(env), false);
    assert.equal(
      isSuperAdminManagementOperator(
        { email: "owner@example.test", role: "superadmin" },
        env,
      ),
      false,
    );
    assert.equal(canAssignSuperAdminRole("another-owner@example.test", env), false);
  }

  const production = {
    ...localDemo,
    NODE_ENV: "production",
    DB_HOST: "db.example",
    PRIMARY_SUPER_ADMIN_EMAIL: "maripwriter@gmail.com",
  };
  assert.equal(
    isSuperAdminManagementOperator(
      { email: "maripwriter@gmail.com", role: "superadmin" },
      production,
    ),
    true,
  );
  assert.equal(canAssignSuperAdminRole("maripwriter@gmail.com", production), true);
});
