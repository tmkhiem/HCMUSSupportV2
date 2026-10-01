using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class D06_Groups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_groups_org_unit_id",
                table: "groups");

            migrationBuilder.CreateIndex(
                name: "ux_groups_org_unit",
                table: "groups",
                column: "org_unit_id",
                unique: true,
                filter: "kind = 'org_unit'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_groups_shape",
                table: "groups",
                sql: "(kind <> 'org_unit' OR org_unit_id IS NOT NULL) AND (kind <> 'rule' OR rule IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_groups_org_unit",
                table: "groups");

            migrationBuilder.DropCheckConstraint(
                name: "ck_groups_shape",
                table: "groups");

            migrationBuilder.CreateIndex(
                name: "ix_groups_org_unit_id",
                table: "groups",
                column: "org_unit_id");
        }
    }
}
