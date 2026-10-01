-- ============================================================================
-- HRM Read-Only SQL Login for HCMUS Support V2 Sync Tool
-- ============================================================================
--
-- PURPOSE:
-- Creates a least-privilege SQL Server login and database user for the
-- HCMUSSupportV2.Sync tool. Grants SELECT only on the HRM tables used by the
-- Sync tool; denies all other permissions.
--
-- USAGE:
-- 1. Open this script in SQL Server Management Studio.
-- 2. Replace <CHANGE_ME> (below) with a strong, random password.
--    Store the password securely (deployment secrets, key vault, etc.).
--    Never commit it to source control.
-- 3. Execute the script as sa or a DBA account.
-- 4. Verify the login exists: Object Explorer > Security > Logins > hcmus_support_sync.
-- 5. Update the HCMUSSupportV2.Sync tool's appsettings.json to use:
--    Server=<HRM_SERVER>;Database=HRM;User Id=hcmus_support_sync;Password=<password>
--
-- SECURITY NOTES:
-- - This login has SELECT only on the 26 tables listed below (17 data tables + joins).
-- - It cannot INSERT, UPDATE, DELETE, CREATE, or EXECUTE.
-- - It cannot access system tables or any other database.
-- - The password should be changed every 90 days (store in a secure secret manager).
--
-- REVIEWED BY: [DBA name and date]
-- ============================================================================

USE [master];

-- Step 1: Create the login (if it does not exist)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'hcmus_support_sync')
BEGIN
    CREATE LOGIN [hcmus_support_sync] WITH PASSWORD = '<CHANGE_ME>';
    PRINT 'Login hcmus_support_sync created.';
END
ELSE
BEGIN
    PRINT 'Login hcmus_support_sync already exists.';
END

-- Step 2: Switch to the HRM database and create the database user
USE [HRM];

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'hcmus_support_sync')
BEGIN
    CREATE USER [hcmus_support_sync] FOR LOGIN [hcmus_support_sync];
    PRINT 'User hcmus_support_sync created in HRM database.';
END
ELSE
BEGIN
    PRINT 'User hcmus_support_sync already exists in HRM database.';
END

-- Step 3: Grant SELECT on the 26 HRM tables used by the Sync tool

-- Core employee table
GRANT SELECT ON [dbo].[NS_NHANSU] TO [hcmus_support_sync];

-- Historical tracking tables (v2 reads these for typed data)
GRANT SELECT ON [dbo].[NS_QuaTrinhLuong] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[NS_QuaTrinhChucVu] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[NS_QuaTrinhKhenThuong] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[NS_QuaTrinhDaoTao] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[NS_QuaTrinhSangKien] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[NS_QuaTrinhBoiDuong] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[NS_QuaTrinhCongTac] TO [hcmus_support_sync];

-- Organization and department master data (needed for org_units in v2)
GRANT SELECT ON [dbo].[DM_DONVI] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_PHONGBAN] TO [hcmus_support_sync];

-- Reference/lookup tables (DM_* tables used in joins)
GRANT SELECT ON [dbo].[DM_CHUYENNGANH] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_PhuongXa] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_QuanHuyen] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_TinhThanhPho] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_DanToc] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_QUOCTICH] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_TONGIAO] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_HOCHAM] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_HOCVI] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_ChucVu] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_TrinhDoHocVan] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_ChinhTri] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_NganHang] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_LoaiBangCap] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_HinhThucDaoTao] TO [hcmus_support_sync];
GRANT SELECT ON [dbo].[DM_LoaiSangKien] TO [hcmus_support_sync];

PRINT 'SELECT permissions granted on 26 HRM tables.';

-- Step 4: Explicitly deny all other permissions to ensure least privilege
DENY ALTER ON DATABASE::[HRM] TO [hcmus_support_sync];
DENY CREATE TABLE TO [hcmus_support_sync];
DENY CREATE PROCEDURE TO [hcmus_support_sync];
DENY EXECUTE TO [hcmus_support_sync];
DENY INSERT ON SCHEMA::[dbo] TO [hcmus_support_sync];
DENY UPDATE ON SCHEMA::[dbo] TO [hcmus_support_sync];
DENY DELETE ON SCHEMA::[dbo] TO [hcmus_support_sync];

PRINT 'Write and administrative permissions denied.';

-- Step 5: Verify the setup
PRINT '';
PRINT '===== Verification Queries =====';
PRINT 'Run these manually to confirm:';
PRINT '';
PRINT '1. Check login exists:';
PRINT '   SELECT name FROM sys.server_principals WHERE name = ''hcmus_support_sync'';';
PRINT '';
PRINT '2. Check user exists in HRM:';
PRINT '   USE [HRM]; SELECT name FROM sys.database_principals WHERE name = ''hcmus_support_sync'';';
PRINT '';
PRINT '3. Test connection (as hcmus_support_sync):';
PRINT '   SELECT COUNT(*) AS row_count FROM [dbo].[NS_NHANSU];';
PRINT '';
PRINT '4. Confirm write access is denied (should return error):';
PRINT '   USE [HRM]; INSERT INTO [dbo].[NS_NHANSU] ([MA], [NHANSU]) VALUES (''TEST'', 0);';
PRINT '';
