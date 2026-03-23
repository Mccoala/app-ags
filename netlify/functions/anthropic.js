export const handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // Try multiple env var names for compatibility
    const apiKey =
      process.env.ANTHROPIC_API_KEY ||
      process.env.VITE_ANTHROPIC_API_KEY ||
      process.env.VITE_ANTHROPIC_KEY ||
      process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      console.error("No API key found. Checked: ANTHROPIC_API_KEY, VITE_ANTHROPIC_API_KEY, VITE_ANTHROPIC_KEY, CLAUDE_API_KEY");
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: { message: "API key not configured. Configure ANTHROPIC_API_KEY no painel do Netlify (Site configuration > Environment variables)." } })
      };
    }

    const requestBody = JSON.parse(event.body);

    // Always use a stable, available model
    requestBody.model = "claude-3-5-sonnet-20241022";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Anthropic function error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: { message: error.message || "Internal Server Error" } })
    };
  }
};
