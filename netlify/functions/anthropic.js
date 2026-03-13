export const handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const apiKey = process.env.VITE_ANTHROPIC_API_KEY || "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";
    
    const requestBody = JSON.parse(event.body);
    
    // Fallback to claude-sonnet-4-6 or the requested model if standard
    let model = requestBody.model || "claude-sonnet-4-6";
    if (model === "claude-3-5-sonnet-20241022" || model === "claude-3-5-sonnet-20240620") {
       model = "claude-sonnet-4-6";
    }

    requestBody.model = model;

    // Use native global fetch
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
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: error.message || "Internal Server Error" })
    };
  }
};
