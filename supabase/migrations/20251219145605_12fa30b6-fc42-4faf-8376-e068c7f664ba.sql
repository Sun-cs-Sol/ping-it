-- Corrigir política de INSERT em tickets para permitir agentes criarem tickets para outros
DROP POLICY IF EXISTS "Solicitantes can create tickets" ON tickets;

CREATE POLICY "Users can create tickets"
ON tickets FOR INSERT
TO authenticated
WITH CHECK (
  solicitante_id = auth.uid() 
  OR has_role(auth.uid(), 'agente_ti'::app_role)
  OR has_role(auth.uid(), 'agente_manutencao'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Corrigir política de INSERT em interactions para incluir agente_manutencao
DROP POLICY IF EXISTS "Users can create interactions on their tickets" ON interactions;

CREATE POLICY "Users can create interactions on their tickets"
ON interactions FOR INSERT
TO authenticated
WITH CHECK (
  (autor_id = auth.uid()) 
  AND (
    EXISTS (
      SELECT 1 FROM tickets
      WHERE tickets.id = interactions.ticket_id
      AND (tickets.solicitante_id = auth.uid() OR tickets.agente_id = auth.uid())
    )
    OR has_role(auth.uid(), 'agente_ti'::app_role)
    OR has_role(auth.uid(), 'agente_manutencao'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);