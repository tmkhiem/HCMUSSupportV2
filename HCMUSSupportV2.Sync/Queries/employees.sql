-- employees: NS_NHANSU roster -> EmployeeRow. hrm_id is NS_NHANSU.NHANSU (the real PK; MA / MSCB is NOT unique: a few
-- duplicates exist and the server quarantines them as duplicate_mscb).
-- status: ASSUMPTION to confirm with the HRM owner (columns taken from NS_NHANSU in docs/jjobs/detailed-profile.jjob):
--   Del = 1 or NgayDeleted set -> inactive; NGAYNGHIVIEC in the past -> retired; IsNgungCongTac = 1 -> inactive; else active.
SELECT CAST(ns.NHANSU AS int)                                   AS hrm_id,
       LTRIM(RTRIM(ns.MA))                                      AS code,
       LTRIM(RTRIM(CONCAT(ns.HODEM, N' ', ns.TEN)))             AS full_name,
       CAST(ns.DONVI AS int)                                    AS org_unit_hrm_id,
       CAST(ns.PHONGBAN AS int) + 1000000                       AS department_hrm_id,  -- same offset as org-units.sql
       cv.TenChucVu                                             AS position_title,
       hh.TenHocHam                                             AS academic_rank,
       hv.TenHocVi                                              AS degree,
       CASE
           WHEN ns.Del = 1 OR ns.NgayDeleted IS NOT NULL THEN N'inactive'
           WHEN ns.NGAYNGHIVIEC IS NOT NULL AND ns.NGAYNGHIVIEC <= GETDATE() THEN N'retired'
           WHEN ns.IsNgungCongTac = 1 THEN N'inactive'
           ELSE N'active'
       END                                                      AS status
FROM dbo.NS_NHANSU ns
LEFT JOIN dbo.DM_ChucVu cv ON ns.CHUCVU = cv.MaChucVu
LEFT JOIN dbo.DM_HOCHAM hh ON ns.HOCHAM = hh.MaHocHam
LEFT JOIN dbo.DM_HOCVI  hv ON ns.HOCVI  = hv.MaHocVi
WHERE ns.MA IS NOT NULL AND LTRIM(RTRIM(ns.MA)) <> N''
ORDER BY ns.NHANSU;
