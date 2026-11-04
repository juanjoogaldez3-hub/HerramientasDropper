// Dropper · Temu — diagnóstico temporal de zonas: retirado. Ahora temu-sync cuenta las zonas (tabla temu_zonas_ruta).
Deno.serve(() => new Response(JSON.stringify({ error: "retirada" }), { status: 410, headers: { "content-type": "application/json" } }));
