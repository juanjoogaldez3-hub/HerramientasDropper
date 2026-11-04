// Dropper · Temu — diagnóstico temporal: retirado.
Deno.serve(() => new Response(JSON.stringify({ error: "retirada" }), { status: 410, headers: { "content-type": "application/json" } }));
