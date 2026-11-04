// Dropper · Temu — diagnóstico temporal de zonas: retirado. Ahora temu-sync cuenta las zonas de lo que viene mañana (tabla temu_zonas_pendientes).
Deno.serve(() => new Response(JSON.stringify({ error: "retirada" }), { status: 410, headers: { "content-type": "application/json" } }));
