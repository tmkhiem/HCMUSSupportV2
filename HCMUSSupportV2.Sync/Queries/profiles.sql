-- profiles: general + detailed profile (one row per NS_NHANSU) -> ProfileRow with the sensitive block.
-- hrm_id is NS_NHANSU.NHANSU. Birth date parts stay separate (NGAYSINH/THANGSINH/NAMSINH may be partial); the mapper
-- composes yyyy-MM-dd / yyyy-MM / yyyy. Date columns may be date or text; the mapper accepts both.
SELECT CAST(ns.NHANSU AS int)              AS hrm_id,
       LTRIM(RTRIM(ns.MA))                 AS employee_code,
       ns.HODEM                            AS last_name,
       ns.TEN                              AS first_name,
       CAST(ns.NGAYSINH  AS nvarchar(10))  AS birth_day,
       CAST(ns.THANGSINH AS nvarchar(10))  AS birth_month,
       CAST(ns.NAMSINH   AS nvarchar(10))  AS birth_year,
       IIF(ns.GIOITINH = 1, N'Nam', N'Nữ') AS gender,
       dt.TenDanToc                        AS ethnicity,
       tg.TenTonGiao                       AS religion,
       qt.TenQuocTich                      AS nationality,
       ns.NOISINH                          AS birth_place,
       ns.NGUYENQUAN                       AS hometown,
       ns.DIDONG                           AS phone_mobile,
       ns.DIENTHOAI                        AS phone_home,
       ns.EMAIL                            AS personal_email,
       ns.HoKhauThuongTru                  AS permanent_address,
       px1.TenPhuongXa                     AS permanent_ward,
       qh1.TenQuanHuyen                    AS permanent_district,
       tt1.TenTinhThanhPho                 AS permanent_province,
       ns.DCLL                             AS contact_address,
       pxll.TenPhuongXa                    AS contact_ward,
       qhll.TenQuanHuyen                   AS contact_district,
       ttll.TenTinhThanhPho                AS contact_province,
       ns.Ngach_CongChuc                   AS salary_grade_code,
       CAST(NULL AS nvarchar(200))         AS salary_grade_name,
       ns.BacCongChuc                      AS salary_step,
       ns.HeSoLuong                        AS salary_coefficient,
       ns.PhanTramVuotKhung                AS over_grade_pct,
       tdhv.TenTrinhDoHocVan               AS education_level,
       cn.TenChuyenNganh                   AS major,
       ct.TenChinhTri                      AS political_theory,
       ns.DANGVIEN                         AS is_party_member,
       ns.NGAYVAODANG                      AS party_joined_on,
       ns.HSDANG                           AS party_file_no,
       ns.THEDANG                          AS party_card_no,
       ns.DOANVIEN                         AS is_youth_union_member,
       ns.NGAYVAODOAN                      AS youth_union_joined_on,
       ns.HSDOAN                           AS youth_file_no,
       ns.THEDOAN                          AS youth_card_no,
       ns.CongDoanVien                     AS is_trade_union_member,
       ns.NgayVaoCongDoan                  AS trade_union_joined_on,
       ns.THECONGDOAN                      AS trade_union_card_no,
       -- sensitive (employee_sensitive; masked by the API)
       ns.SOCMND                           AS national_id,
       ns.NGAYCAP                          AS national_id_issued_on,
       ns.NOICAP                           AS national_id_issued_by,
       ns.MST                              AS tax_code,
       nh.TenNganHang                      AS bank_name,
       ns.NganHangChiNhanh                 AS bank_branch,
       ns.SOTAIKHOAN                       AS bank_account,
       ns.BHXH                             AS social_insurance_no,
       ns.BHYT                             AS health_insurance_no
FROM dbo.NS_NHANSU ns
LEFT JOIN dbo.DM_CHUYENNGANH  cn   ON ns.CHUYENNGANH         = cn.MaChuyenNganh
LEFT JOIN dbo.DM_PhuongXa     px1  ON ns.MaPhuongXa          = px1.MaPhuongXa
LEFT JOIN dbo.DM_QuanHuyen    qh1  ON ns.QUAN_HUYEN          = qh1.MaQuanHuyen
LEFT JOIN dbo.DM_TinhThanhPho tt1  ON ns.TINH_THANHPHO       = tt1.MaTinhThanhPho
LEFT JOIN dbo.DM_PhuongXa     pxll ON ns.MaPhuongXa_LienLac  = pxll.MaPhuongXa
LEFT JOIN dbo.DM_QuanHuyen    qhll ON ns.QUAN_HUYEN_LienLac  = qhll.MaQuanHuyen
LEFT JOIN dbo.DM_TinhThanhPho ttll ON ns.TINH_THANHPHO_LienLac = ttll.MaTinhThanhPho
LEFT JOIN dbo.DM_DanToc       dt   ON ns.DANTOC              = dt.MaDanToc
LEFT JOIN dbo.DM_QUOCTICH     qt   ON ns.QUOCTICH            = qt.MaQuocTich
LEFT JOIN dbo.DM_TONGIAO      tg   ON ns.TONGIAO             = tg.MaTonGiao
LEFT JOIN dbo.DM_TrinhDoHocVan tdhv ON ns.TRINHDOHOCVAN      = tdhv.MaTrinhDoHocVan
LEFT JOIN dbo.DM_ChinhTri     ct   ON ns.CHINHTRI            = ct.MaChinhTri
LEFT JOIN dbo.DM_NganHang     nh   ON ns.NGANHANG            = nh.MaNganHang
WHERE ns.MA IS NOT NULL AND LTRIM(RTRIM(ns.MA)) <> N''
ORDER BY ns.NHANSU;
