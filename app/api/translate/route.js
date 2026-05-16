export async function POST(req) {
  try {
    const { text, source = "en", target = "si" } = await req.json();

    if (!text || !text.trim()) {
      return Response.json({ translation: "" });
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) {
      throw new Error(`Translate API error: ${res.status}`);
    }

    const data = await res.json();

    // Google translate response parse කරන්න
    let translated = "";
    if (data && data[0]) {
      translated = data[0]
        .filter((item) => item && item[0])
        .map((item) => item[0])
        .join("");
    }

    return Response.json({ translation: translated });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
