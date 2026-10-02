using System.Security.Cryptography;
using System.Text;

namespace HCMUSSupportV2.Backend.Modules.Legacy.Notifications;

/// <summary>
/// Deterministic UUID v7 ids for migrated rows: the 48-bit timestamp is <c>publishedAt</c> in Unix milliseconds (so ids
/// sort like the posts), the version and variant bits are set, and the remaining 74 bits come from
/// <c>SHA-256(prefix + legacyKey)</c>. The same post always maps to the same id, so a re-run finds its rows.
/// </summary>
public static class LegacyIds
{
    private const long MaxMillis = (1L << 48) - 1;

    /// <summary>Whether <paramref name="publishedAt"/> fits the 48-bit timestamp.</summary>
    public static bool IsValidTimestamp(DateTimeOffset publishedAt) => publishedAt.ToUnixTimeMilliseconds() is >= 0 and <= MaxMillis;

    /// <summary>The id of the notification of a v1 post.</summary>
    public static Guid NotificationId(string legacyKey, DateTimeOffset publishedAt) => Create("legacy:", legacyKey, publishedAt);

    /// <summary>The id of the (single) recipient import row of a migrated notification.</summary>
    public static Guid RecipientImportId(string legacyKey, DateTimeOffset publishedAt) => Create("legacy-import:", legacyKey, publishedAt);

    private static Guid Create(string prefix, string legacyKey, DateTimeOffset publishedAt)
    {
        var millis = publishedAt.ToUnixTimeMilliseconds();
        if (millis is < 0 or > MaxMillis) throw new ArgumentOutOfRangeException(nameof(publishedAt), "publishedAt does not fit a UUID v7 timestamp.");
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(prefix + legacyKey));

        var bytes = new byte[16];
        for (var i = 0; i < 6; i++) bytes[i] = (byte)(millis >> (8 * (5 - i)));
        bytes[6] = (byte)(0x70 | (hash[0] & 0x0F));   // version 7 + 4 hash bits
        bytes[7] = hash[1];
        bytes[8] = (byte)(0x80 | (hash[2] & 0x3F));   // RFC 4122 variant + 6 hash bits
        Array.Copy(hash, 3, bytes, 9, 7);
        return new Guid(bytes, bigEndian: true);
    }
}
