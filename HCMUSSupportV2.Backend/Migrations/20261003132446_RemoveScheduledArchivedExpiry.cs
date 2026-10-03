using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class RemoveScheduledArchivedExpiry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_notifications_status_publish_at",
                table: "notifications");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notifications_status",
                table: "notifications");

            // Scheduled and archived posts go back to drafts: hidden from employees, nothing is lost.
            migrationBuilder.Sql("UPDATE notifications SET status = 'draft' WHERE status IN ('scheduled', 'archived')");

            migrationBuilder.DropColumn(
                name: "expires_at",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "publish_at",
                table: "notifications");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_status",
                table: "notifications",
                column: "status");

            migrationBuilder.AddCheckConstraint(
                name: "ck_notifications_status",
                table: "notifications",
                sql: "status IN ('draft','published')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_notifications_status",
                table: "notifications");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notifications_status",
                table: "notifications");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "expires_at",
                table: "notifications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "publish_at",
                table: "notifications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_notifications_status_publish_at",
                table: "notifications",
                columns: new[] { "status", "publish_at" });

            migrationBuilder.AddCheckConstraint(
                name: "ck_notifications_status",
                table: "notifications",
                sql: "status IN ('draft','scheduled','published','archived')");
        }
    }
}
