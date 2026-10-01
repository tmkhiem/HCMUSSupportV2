using System.Security.Cryptography;
using System.Text;

namespace HCMUSSupportV2.Sync.Sources;

/// <summary>
/// Deterministic synthetic <c>hrm_id</c>s for sources that lack real primary keys (the v1 JSON of <c>legacy-git</c>).
/// id = hash(dataset | MSCB | row content | occurrence index) mapped into [<see cref="Base"/>, int.MaxValue), so an
/// unchanged row keeps its id across runs and identical rows get distinct ids. A hash collision inside one run is
/// resolved by linear probing in input order.
/// </summary>
/// <remarks>
/// Limitation: the id depends on row content, so an edited row is seen by the server as a delete plus an insert.
/// A later <c>sync hrm</c> run posts the real source keys; the snapshot semantics then delete every synthetic row.
/// </remarks>
public sealed class IdSynthesizer(string dataset)
{
    public const int Base = 1_000_000_000;

    private readonly HashSet<int> _used = [];
    private readonly Dictionary<string, int> _occurrences = [];

    public int Next(string key, string content)
    {
        var material = dataset + "\u001f" + key + "\u001f" + content;
        var occ = _occurrences.GetValueOrDefault(material);
        _occurrences[material] = occ + 1;
        var id = Hash(material + "\u001f" + occ);
        while (!_used.Add(id)) id = id == int.MaxValue - 1 ? Base : id + 1;
        return id;
    }

    public static int Hash(string text)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(text));
        var n = BitConverter.ToUInt32(bytes, 0) & 0x7FFFFFFF;
        return (int)(Base + n % (uint)(int.MaxValue - Base));
    }
}
