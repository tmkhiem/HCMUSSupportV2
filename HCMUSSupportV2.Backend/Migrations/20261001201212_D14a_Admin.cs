using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class D14a_Admin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_audit_log_action_at",
                table: "audit_log",
                columns: new[] { "action", "at" });

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_at_id",
                table: "audit_log",
                columns: new[] { "at", "id" },
                descending: new bool[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_audit_log_action_at",
                table: "audit_log");

            migrationBuilder.DropIndex(
                name: "ix_audit_log_at_id",
                table: "audit_log");
        }
    }
}
