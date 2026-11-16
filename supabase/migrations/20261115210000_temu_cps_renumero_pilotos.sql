-- CPS volvió a crear las cuentas de motorista con números nuevos (entre el 6 y el 10 de nov de 2026)
-- y reasignó 591 (era Fredy) a Douglas y 593 (era Willhen) a Franklin Lucha.
-- El historial hasta el 5 de nov pasa al número nuevo de cada persona. (Respaldo: *_respaldo_20261115)
create temporary table m(viejo int, nuevo int) on commit drop;
insert into m values (591,549),(593,554),(592,547),(594,546),(597,553),(598,548),(599,550),(600,545),(601,551),(602,552);
update public.temu_envios e set piloto_id = m.nuevo from m where e.piloto_id = m.viejo and e.fecha <= '2026-11-05';
update public.temu_rutas_piloto r set piloto_id = m.nuevo from m where r.piloto_id = m.viejo and r.fecha <= '2026-11-05';
update public.temu_envios set piloto_id = 591 where piloto_id = 607 and fecha <= '2026-11-05';
update public.temu_rutas_piloto set piloto_id = 591 where piloto_id = 607 and fecha <= '2026-11-05';
update public.temu_pilotos set tipo = 'Apoyo' where piloto_id in (545, 551, 553, 554);
update public.temu_pilotos set tipo = 'Fijo' where piloto_id in (591, 593);
update public.temu_pilotos set nombre = regexp_replace(nombre, '\s+Dropper$', '', 'i');
delete from public.temu_pilotos where piloto_id in (592,594,597,598,599,600,601,602,607);
