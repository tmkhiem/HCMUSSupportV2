using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class DropReadAndPin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_notification_deliveries_inbox",
                table: "notification_deliveries");

            migrationBuilder.DropIndex(
                name: "ix_notification_deliveries_unread",
                table: "notification_deliveries");

            migrationBuilder.DropColumn(
                name: "pinned_until",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "read_count",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "read_at",
                table: "notification_deliveries");

            migrationBuilder.CreateIndex(
                name: "ix_notification_deliveries_inbox",
                table: "notification_deliveries",
                columns: new[] { "employee_code", "delivered_at" },
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_notification_deliveries_inbox",
                table: "notification_deliveries");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "pinned_until",
                table: "notifications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "read_count",
                table: "notifications",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "read_at",
                table: "notification_deliveries",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_notification_deliveries_inbox",
                table: "notification_deliveries",
                columns: new[] { "employee_code", "delivered_at" },
                descending: new[] { false, true })
                .Annotation("Npgsql:IndexInclude", new[] { "read_at" });

            migrationBuilder.CreateIndex(
                name: "ix_notification_deliveries_unread",
                table: "notification_deliveries",
                column: "employee_code",
                filter: "read_at IS NULL");
        }
    }
}
