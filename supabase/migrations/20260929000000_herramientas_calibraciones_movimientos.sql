-- StoreControl v2 · 29 sep 2026
-- Nuevas tablas para trazabilidad de herramientas calibradas.
-- Diseño: 1 QR físico permanente por herramienta.
--         Ubicación y movimientos viven en la BD, no en el QR.
--
-- Impacto: aditivo. NO destruye ni modifica nada de lo existente.
-- Ni tareas_instancia, ni documentos_qr, ni audit_log, ni RLS previa se ven afectados.

-- =========================================================================
-- ENUMS
-- =========================================================================

DO $$ BEGIN
  CREATE TYPE herramienta_estado AS ENUM (
    'activa',        -- operativa, calibración vigente
    'en_transito',   -- envío en curso a otra base
    'bloqueada',     -- calibración vencida o defectuosa · NO USAR
    'baja'           -- retirada permanentemente
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movimiento_estado AS ENUM (
    'pendiente_recepcion',   -- origen ya envió, destino aún no confirma
    'recibido',              -- circuito cerrado
    'anulado'                -- cancelado antes de recepción
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- TABLA: herramientas
-- Ficha maestra del activo calibrado.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.herramientas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_interno      text NOT NULL,           -- ej: T-047
  numero_serie        text,                    -- SN del fabricante
  marca               text,
  modelo              text,
  tipo                text,                    -- torquímetro, multímetro, calibrador, etc.
  rango               text,                    -- ej: "15-60 Nm"
  ubicacion_base_id   uuid REFERENCES public.bases(id) ON DELETE SET NULL,
  estado              herramienta_estado NOT NULL DEFAULT 'activa',
  foto_url            text,                    -- opcional, foto de la placa
  notas               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (codigo_interno)
);

CREATE INDEX IF NOT EXISTS idx_herramientas_base       ON public.herramientas(ubicacion_base_id);
CREATE INDEX IF NOT EXISTS idx_herramientas_estado     ON public.herramientas(estado);
CREATE INDEX IF NOT EXISTS idx_herramientas_sn         ON public.herramientas(numero_serie);
CREATE INDEX IF NOT EXISTS idx_herramientas_codigo_lwr ON public.herramientas(lower(codigo_interno));

-- =========================================================================
-- TABLA: calibraciones
-- Historial: cada herramienta tiene N calibraciones a lo largo del tiempo.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.calibraciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  herramienta_id      uuid NOT NULL REFERENCES public.herramientas(id) ON DELETE CASCADE,
  fecha_calibracion   date NOT NULL,
  vence_en            date NOT NULL,
  laboratorio         text,
  certificado_pdf     text,                    -- storage_path en supabase storage
  incertidumbre       jsonb,                   -- estructura libre; ej: {"valor":0.5,"unidad":"Nm"}
  parseado_por_ia     boolean NOT NULL DEFAULT false,
  notas               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calibraciones_herr  ON public.calibraciones(herramienta_id);
CREATE INDEX IF NOT EXISTS idx_calibraciones_vence ON public.calibraciones(vence_en);

-- =========================================================================
-- TABLA: movimientos
-- Cada envío/recepción entre bases (o entre base <-> logística central) = 1 fila.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  herramienta_id      uuid NOT NULL REFERENCES public.herramientas(id) ON DELETE CASCADE,
  from_base_id        uuid REFERENCES public.bases(id) ON DELETE SET NULL,
  to_base_id          uuid REFERENCES public.bases(id) ON DELETE SET NULL,
  estado              movimiento_estado NOT NULL DEFAULT 'pendiente_recepcion',
  enviado_at          timestamptz NOT NULL DEFAULT now(),
  recibido_at         timestamptz,
  enviado_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recibido_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notas               text
);

CREATE INDEX IF NOT EXISTS idx_movs_herr    ON public.movimientos(herramienta_id);
CREATE INDEX IF NOT EXISTS idx_movs_estado  ON public.movimientos(estado);
CREATE INDEX IF NOT EXISTS idx_movs_to_base ON public.movimientos(to_base_id);

-- =========================================================================
-- ENLACE: documentos_qr <-> herramientas (opcional)
-- Extendemos la tabla existente sin romper nada:
-- un documento QR puede opcionalmente estar ligado a una herramienta.
-- =========================================================================

ALTER TABLE public.documentos_qr
  ADD COLUMN IF NOT EXISTS herramienta_id uuid
  REFERENCES public.herramientas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_docsqr_herr ON public.documentos_qr(herramienta_id);

-- =========================================================================
-- TRIGGER: mantener updated_at en herramientas
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_herramientas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_herramientas_updated_at ON public.herramientas;
CREATE TRIGGER trg_herramientas_updated_at
  BEFORE UPDATE ON public.herramientas
  FOR EACH ROW EXECUTE FUNCTION public.tg_herramientas_updated_at();

-- =========================================================================
-- RLS · Row Level Security
-- Regla: admin todo. Storekeeper puede leer todas las herramientas (necesita
-- ver movimientos entrantes), actualizar solo las de su base, e insertar
-- movimientos donde su base sea origen o destino.
-- =========================================================================

ALTER TABLE public.herramientas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibraciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos    ENABLE ROW LEVEL SECURITY;

-- herramientas
CREATE POLICY "herr_read_all"       ON public.herramientas FOR SELECT TO authenticated USING (true);
CREATE POLICY "herr_admin_write"    ON public.herramientas FOR INSERT TO authenticated WITH CHECK (public.es_admin());
CREATE POLICY "herr_admin_update"   ON public.herramientas FOR UPDATE TO authenticated
  USING (public.es_admin() OR ubicacion_base_id = public.mi_base_id())
  WITH CHECK (public.es_admin() OR ubicacion_base_id = public.mi_base_id());
CREATE POLICY "herr_admin_delete"   ON public.herramientas FOR DELETE TO authenticated USING (public.es_admin());

-- calibraciones
CREATE POLICY "cal_read_all"        ON public.calibraciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "cal_admin_insert"    ON public.calibraciones FOR INSERT TO authenticated WITH CHECK (public.es_admin());
CREATE POLICY "cal_admin_update"    ON public.calibraciones FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "cal_admin_delete"    ON public.calibraciones FOR DELETE TO authenticated USING (public.es_admin());

-- movimientos
CREATE POLICY "mov_read_involved"   ON public.movimientos FOR SELECT TO authenticated USING (
  public.es_admin()
  OR from_base_id = public.mi_base_id()
  OR to_base_id   = public.mi_base_id()
);
CREATE POLICY "mov_insert_origin"   ON public.movimientos FOR INSERT TO authenticated WITH CHECK (
  public.es_admin() OR from_base_id = public.mi_base_id()
);
CREATE POLICY "mov_update_involved" ON public.movimientos FOR UPDATE TO authenticated
  USING (public.es_admin() OR from_base_id = public.mi_base_id() OR to_base_id = public.mi_base_id())
  WITH CHECK (public.es_admin() OR from_base_id = public.mi_base_id() OR to_base_id = public.mi_base_id());
CREATE POLICY "mov_admin_delete"    ON public.movimientos FOR DELETE TO authenticated USING (public.es_admin());

-- =========================================================================
-- FUNCIÓN HELPER: cerrar un movimiento (confirma recepción atómicamente)
-- Uso desde la app: supabase.rpc('confirmar_recepcion', { p_mov: <uuid> })
-- =========================================================================

CREATE OR REPLACE FUNCTION public.confirmar_recepcion(p_mov uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_herr uuid;
  v_to   uuid;
BEGIN
  SELECT herramienta_id, to_base_id INTO v_herr, v_to
  FROM public.movimientos
  WHERE id = p_mov AND estado = 'pendiente_recepcion'
  FOR UPDATE;

  IF v_herr IS NULL THEN
    RAISE EXCEPTION 'Movimiento % no encontrado o ya cerrado', p_mov;
  END IF;

  UPDATE public.movimientos
    SET estado = 'recibido',
        recibido_at = now(),
        recibido_by = auth.uid()
    WHERE id = p_mov;

  UPDATE public.herramientas
    SET ubicacion_base_id = v_to,
        estado = 'activa'
    WHERE id = v_herr;
END $$;

GRANT EXECUTE ON FUNCTION public.confirmar_recepcion(uuid) TO authenticated;

-- =========================================================================
-- FIN
-- =========================================================================
