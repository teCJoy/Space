export async function onRequest(context) {
  const url = 'https://opensky-network.org/api/states/all';

  try {
    // 设置超时（通过 AbortController）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Cloudflare Pages Function)',
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    // 检查状态码
    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `OpenSky 返回错误 ${response.status}: ${errorText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 读取响应文本（以防万一，手动解析 JSON）
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: 'OpenSky 返回的数据不是有效 JSON', raw: text.substring(0, 200) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 返回成功数据
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        // 虽然同域不需要 CORS，但保留也无害
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    // 捕获网络错误、超时等
    return new Response(
      JSON.stringify({ error: '代理请求失败: ' + err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
