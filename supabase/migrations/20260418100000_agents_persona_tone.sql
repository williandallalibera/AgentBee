-- Tom de voz do agente chefe (prompt do orquestrador)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS persona_tone TEXT;
