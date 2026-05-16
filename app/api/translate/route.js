export async function POST(req) {
  try {
    const { imageBase64 } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "API key නැත" }, { status: 500 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: `මෙය manga comic page එකකි. මෙහි ඇති සියලු dialogue, narration, සහ text සිංහලට පරිවර්තනය කරන්න.

Panel by panel ක්‍රමයෙන් දක්වන්න:
- Panel 1: [කතාව]
- Panel 2: [කතාව]
ආදී ලෙස.

Sound effects සිංහල ශබ්ද ලෙස [brackets] ඇතුළේ දක්වන්න.
Text නැති cover/blank pages සඳහා "(පිටුවේ text නැත)" කියන්න.
Natural, සරල සිංහල භාවිතා කරන්න.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: data.error?.message || "API error" },
        { status: response.status }
      );
    }

    const text = data.content?.map((c) => c.text || "").join("\n") || "";
    return Response.json({ translation: text });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
