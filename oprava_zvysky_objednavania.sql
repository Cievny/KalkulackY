-- ============================================================
-- SPEVNENIE / UPRATANIE ZVYŠKOV VEREJNÉHO OBJEDNÁVANIA (projekt „Výkony")
--
-- Prečo: v DB projektu Výkony (ncqtiicfqhaturjlfxcj) ostali tabuľky a funkcie
-- z prototypu verejného USG objednávania (orders, open_slots, pricelist,
-- settings, app_secrets + RPC create_order/lookup_order/cancel_order/
-- get_booked_slots/notify_order_emails). Ostrá verzia tejto aplikácie beží
-- v samostatnom projekte (cfavtobowqevetlumktt), takže tu ide o zvyšky.
-- Ich politiky NEPOUŽÍVAJÚ allowlist (je_povoleny), preto ich vidí a mení
-- hociktorý prihlásený účet – aj taký, ktorý v allowliste nie je.
--
-- ČASŤ A je bezpečná a idempotentná – spustite ju hneď.
-- ČASŤ B maže zvyšky natrvalo – odkomentujte až po overení, že sa tieto
-- tabuľky v projekte Výkony naozaj nikde nepoužívajú.
-- ============================================================

-- ============================================================
-- ČASŤ A – spevnenie prístupov (bezpečné spustiť kedykoľvek)
-- ============================================================

-- A1) orders: doteraz ALL pre každého prihláseného (auth.role()='authenticated').
--     Po zmene: čítať/zapisovať smie len povolený používateľ, nie TV kiosk.
DROP POLICY IF EXISTS "objednavky spravuje personal" ON public.orders;
CREATE POLICY "orders povoleny select" ON public.orders
  FOR SELECT TO authenticated USING (je_povoleny());
CREATE POLICY "orders povoleny insert" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (je_povoleny() AND NOT je_tv());
CREATE POLICY "orders povoleny update" ON public.orders
  FOR UPDATE TO authenticated USING (je_povoleny() AND NOT je_tv())
                              WITH CHECK (je_povoleny() AND NOT je_tv());
CREATE POLICY "orders povoleny delete" ON public.orders
  FOR DELETE TO authenticated USING (je_povoleny() AND NOT je_tv());
-- kiosk (tv@/sala@) nesmie vidieť pacientske objednávky
DROP POLICY IF EXISTS "kiosk nesmie citat orders" ON public.orders;
CREATE POLICY "kiosk nesmie citat orders" ON public.orders
  AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT je_kiosk());

-- A2) open_slots: verejné čítanie termínov je v poriadku, zápis len allowlist.
DROP POLICY IF EXISTS "sloty spravuje personal" ON public.open_slots;
CREATE POLICY "open_slots povoleny zapis" ON public.open_slots
  FOR ALL TO authenticated USING (je_povoleny() AND NOT je_tv())
                           WITH CHECK (je_povoleny() AND NOT je_tv());

-- A3) pricelist: verejné čítanie aktívneho cenníka OK, zápis len allowlist.
DROP POLICY IF EXISTS "cennik spravuje personal" ON public.pricelist;
CREATE POLICY "pricelist povoleny zapis" ON public.pricelist
  FOR ALL TO authenticated USING (je_povoleny() AND NOT je_tv())
                           WITH CHECK (je_povoleny() AND NOT je_tv());

-- A4) settings: doteraz USING(true) => celú tabuľku (vrátane notify_email
--     a IBAN) čítal aj neprihlásený anon. Verejne necháme len kľúče, ktoré
--     verejná stránka naozaj potrebuje.
DROP POLICY IF EXISTS "nastavenia cita ktokolvek" ON public.settings;
DROP POLICY IF EXISTS "nastavenia spravuje personal" ON public.settings;
CREATE POLICY "settings verejne kluce" ON public.settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('iban','beneficiary','doctors'));
CREATE POLICY "settings povoleny select" ON public.settings
  FOR SELECT TO authenticated USING (je_povoleny());
CREATE POLICY "settings admin zapis" ON public.settings
  FOR ALL TO authenticated USING (je_admin()) WITH CHECK (je_admin());

-- A5) RPC funkcie verejného objednávania nemá volať nikto neprihlásený,
--     kým tu tá aplikácia nebeží. (Trigger funkciu cez REST volať netreba.)
REVOKE EXECUTE ON FUNCTION public.create_order(text,text,text,numeric,boolean,text,text,text,text,date,text,text,text,date,time,text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.lookup_order(text,text)  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cancel_order(text,text)  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_booked_slots()       FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_order_emails()    FROM anon, authenticated, public;

-- A6) Kontrola po spustení – nemá vrátiť žiadny riadok.
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND (qual LIKE '%auth.role()%' OR with_check LIKE '%auth.role()%');

-- ============================================================
-- ČASŤ B – trvalé odstránenie zvyškov (odkomentovať vedome!)
-- Ostrá aplikácia objednávania beží v projekte cfavtobowqevetlumktt;
-- tu sú orders aj open_slots prázdne. Po dropnutí zmizne aj natvrdo
-- zapísaný webhook secret vo funkcii notify_order_emails().
-- ============================================================
-- DROP TRIGGER IF EXISTS orders_email_notify ON public.orders;
-- DROP FUNCTION IF EXISTS public.notify_order_emails();
-- DROP FUNCTION IF EXISTS public.create_order(text,text,text,numeric,boolean,text,text,text,text,date,text,text,text,date,time,text);
-- DROP FUNCTION IF EXISTS public.lookup_order(text,text);
-- DROP FUNCTION IF EXISTS public.cancel_order(text,text);
-- DROP FUNCTION IF EXISTS public.get_booked_slots();
-- DROP TABLE IF EXISTS public.orders;
-- DROP TABLE IF EXISTS public.open_slots;
-- DROP TABLE IF EXISTS public.pricelist;
-- DROP TABLE IF EXISTS public.settings;
-- DROP TABLE IF EXISTS public.app_secrets;
-- -- pg_net už potom netreba v public schéme:
-- -- DROP EXTENSION IF EXISTS pg_net;
