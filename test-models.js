async function test(modelName) {
  const sys = `system`;
  const content = `content`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "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",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 10,
        system: sys,
        messages: [{ role: "user", content }]
      })
    });
    const d = await res.json();
    console.log(`[${modelName}] Response:`, JSON.stringify(d).substring(0, 150));
  } catch(e) {
    console.error(`[${modelName}] Error:`, e.message);
  }
}

async function runAll() {
    await test("claude-3-haiku-20240307");
    await test("claude-3-sonnet-20240229");
    await test("claude-2.1");
    await test("claude-3-opus-20240229");
    await test("claude-3-5-haiku-20241022");
    await test("claude-instant-1.2");
}
runAll();
