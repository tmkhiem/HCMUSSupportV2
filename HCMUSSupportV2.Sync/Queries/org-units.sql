-- org-units: DM_DONVI (units) and DM_PHONGBAN (departments) -> OrgUnitRow.
-- hrm_id is one int space on the server, and DM_DONVI.MADONVI and DM_PHONGBAN.MAPHONGBAN may overlap, so department ids are
-- offset by 1000000. employees.sql applies the same offset to department_hrm_id; keep them identical.
-- A department's parent unit is the unit most of its staff belong to (NS_NHANSU.DONVI), because DM_PHONGBAN's own unit
-- column is not part of the documented HRM layout. Ties break on the lower unit id.
WITH dept_unit AS (
    SELECT PHONGBAN, DONVI,
           ROW_NUMBER() OVER (PARTITION BY PHONGBAN ORDER BY COUNT(*) DESC, DONVI) AS rn
    FROM dbo.NS_NHANSU
    WHERE PHONGBAN IS NOT NULL AND DONVI IS NOT NULL
    GROUP BY PHONGBAN, DONVI
)
SELECT CAST(u.MADONVI AS int)               AS hrm_id,
       CAST(NULL AS int)                    AS parent_hrm_id,
       N'unit'                              AS kind,
       LTRIM(RTRIM(u.TENDONVI))             AS name,
       CAST(NULL AS nvarchar(50))           AS code,
       CAST(1 AS bit)                       AS is_active
FROM dbo.DM_DONVI u
WHERE u.TENDONVI IS NOT NULL
UNION ALL
SELECT CAST(p.MAPHONGBAN AS int) + 1000000  AS hrm_id,
       CAST(du.DONVI AS int)                AS parent_hrm_id,
       N'department'                        AS kind,
       LTRIM(RTRIM(p.TENPHONGBAN))          AS name,
       CAST(NULL AS nvarchar(50))           AS code,
       CAST(1 AS bit)                       AS is_active
FROM dbo.DM_PHONGBAN p
LEFT JOIN dept_unit du ON du.PHONGBAN = p.MAPHONGBAN AND du.rn = 1
WHERE p.TENPHONGBAN IS NOT NULL;
