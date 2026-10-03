using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class NotificationDeliveryTelemetry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "fetched",
                table: "notification_deliveries",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "opened",
                table: "notification_deliveries",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "fetched",
                table: "notification_deliveries");

            migrationBuilder.DropColumn(
                name: "opened",
                table: "notification_deliveries");
        }
    }
}
