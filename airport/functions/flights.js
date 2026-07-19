export async function onRequest(context) {
  const url = 'https://opensky-network.org/api/states/all';
  const response = await fetch(url);
  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
