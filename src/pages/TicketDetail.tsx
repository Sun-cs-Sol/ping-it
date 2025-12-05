import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  Send, 
  Image as ImageIcon, 
  FileText, 
  Play,
  Pause,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Star
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getSignedUrl, getSignedUrls } from '@/lib/storage';

type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';

interface TicketData {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  status: TicketStatus;
  prioridade: string;
  setor: string | null;
  anexos: {
    imagens: string[];
    arquivos: string[];
    audio: string | null;
  };
  created_at: string;
  solicitante: {
    id: string;
    nome: string;
    foto_perfil: string | null;
  } | null;
  agente: {
    id: string;
    nome: string;
    foto_perfil: string | null;
  } | null;
}

interface Interaction {
  id: string;
  mensagem: string | null;
  tipo: string;
  created_at: string;
  autor: {
    id: string;
    nome: string;
    foto_perfil: string | null;
  } | null;
}

interface SignedUrls {
  imagens: (string | null)[];
  arquivos: (string | null)[];
  audio: string | null;
}

const statusConfig: Record<TicketStatus, { label: string; color: string; icon: React.ReactNode }> = {
  aberto: { label: 'Aberto', color: 'bg-status-open text-white', icon: <AlertCircle className="h-4 w-4" /> },
  em_andamento: { label: 'Em Andamento', color: 'bg-status-in-progress text-white', icon: <Clock className="h-4 w-4" /> },
  aguardando_resposta: { label: 'Aguardando', color: 'bg-status-waiting text-white', icon: <Clock className="h-4 w-4" /> },
  resolvido: { label: 'Resolvido', color: 'bg-status-resolved text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
  fechado: { label: 'Fechado', color: 'bg-status-closed text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [hasFeedback, setHasFeedback] = useState(false);
  const [signedUrls, setSignedUrls] = useState<SignedUrls>({ imagens: [], arquivos: [], audio: null });
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchTicket();
      fetchInteractions();
      checkFeedback();
    }
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions]);

  // Fetch signed URLs when ticket loads
  useEffect(() => {
    const fetchSignedUrls = async () => {
      if (!ticket?.anexos) return;
      
      const [imagens, arquivos, audio] = await Promise.all([
        getSignedUrls(ticket.anexos.imagens || []),
        getSignedUrls(ticket.anexos.arquivos || []),
        ticket.anexos.audio ? getSignedUrl(ticket.anexos.audio) : null,
      ]);
      
      setSignedUrls({ imagens, arquivos, audio });
    };
    
    fetchSignedUrls();
  }, [ticket]);

  // Real-time subscription
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`ticket-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'interactions',
          filter: `ticket_id=eq.${id}`,
        },
        () => {
          fetchInteractions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${id}`,
        },
        () => {
          fetchTicket();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchTicket = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          protocolo,
          titulo,
          descricao,
          status,
          prioridade,
          setor,
          anexos,
          created_at,
          solicitante:profiles!tickets_solicitante_id_fkey(id, nome, foto_perfil),
          agente:profiles!tickets_agente_id_fkey(id, nome, foto_perfil)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      
      setTicket(data as unknown as TicketData);
    } catch (error) {
      console.error('Error fetching ticket:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar o ticket',
        variant: 'destructive',
      });
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchInteractions = async () => {
    try {
      const { data, error } = await supabase
        .from('interactions')
        .select(`
          id,
          mensagem,
          tipo,
          created_at,
          autor:profiles!interactions_autor_id_fkey(id, nome, foto_perfil)
        `)
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setInteractions(data as unknown as Interaction[]);
    } catch (error) {
      console.error('Error fetching interactions:', error);
    }
  };

  const checkFeedback = async () => {
    try {
      const { data } = await supabase
        .from('feedbacks')
        .select('id')
        .eq('ticket_id', id)
        .maybeSingle();
      
      setHasFeedback(!!data);
    } catch (error) {
      console.error('Error checking feedback:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !id) return;

    setSending(true);
    try {
      const { error } = await supabase.from('interactions').insert({
        ticket_id: id,
        autor_id: user.id,
        mensagem: newMessage.trim(),
        tipo: 'texto',
      });

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar a mensagem',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const submitFeedback = async () => {
    if (!user || !id || feedbackRating === 0) return;

    setSubmittingFeedback(true);
    try {
      const { error } = await supabase.from('feedbacks').insert({
        ticket_id: id,
        avaliador_id: user.id,
        nota_satisfacao: feedbackRating,
        comentarios: feedbackComment || null,
      });

      if (error) throw error;

      toast({
        title: 'Avaliação enviada!',
        description: 'Obrigado pelo seu feedback',
      });
      setShowFeedback(false);
      setHasFeedback(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar a avaliação',
        variant: 'destructive',
      });
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
          <div className="container flex h-16 items-center gap-4">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </header>
        <main className="container py-6">
          <Skeleton className="h-[400px] w-full rounded-lg" />
        </main>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Ticket não encontrado</p>
      </div>
    );
  }

  const canSendMessage = ticket.status !== 'fechado';
  const canEvaluate = ticket.status === 'resolvido' && 
                      ticket.solicitante?.id === user?.id && 
                      !hasFeedback;

  const hasAttachments = signedUrls.imagens.some(Boolean) || 
                         signedUrls.arquivos.some(Boolean) || 
                         signedUrls.audio;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="container flex h-16 items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">
                {ticket.protocolo}
              </span>
              <Badge className={statusConfig[ticket.status].color}>
                {statusConfig[ticket.status].icon}
                <span className="ml-1">{statusConfig[ticket.status].label}</span>
              </Badge>
            </div>
            <h1 className="truncate text-lg font-semibold">{ticket.titulo}</h1>
          </div>
          {canEvaluate && (
            <Button onClick={() => setShowFeedback(true)} variant="outline" size="sm">
              <Star className="mr-2 h-4 w-4" />
              Avaliar
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="container flex flex-1 flex-col gap-4 py-4">
        {/* Ticket Info Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Detalhes da Solicitação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{ticket.descricao}</p>
            
            {/* Attachments with signed URLs */}
            {hasAttachments && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Anexos:</p>
                <div className="flex flex-wrap gap-2">
                  {signedUrls.imagens.map((img, i) => img && (
                    <a
                      key={i}
                      href={img}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-16 w-16 items-center justify-center rounded-lg border bg-muted hover:bg-accent"
                    >
                      <img
                        src={img}
                        alt={`Anexo ${i + 1}`}
                        className="h-full w-full rounded-lg object-cover"
                      />
                    </a>
                  ))}
                  {signedUrls.arquivos.map((file, i) => file && (
                    <a
                      key={i}
                      href={file}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-16 w-16 items-center justify-center rounded-lg border bg-muted hover:bg-accent"
                    >
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </a>
                  ))}
                  {signedUrls.audio && (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted p-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        onClick={toggleAudio}
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5" />
                        ) : (
                          <Play className="h-5 w-5" />
                        )}
                      </Button>
                      <span className="text-sm">Áudio</span>
                      <audio
                        ref={audioRef}
                        src={signedUrls.audio}
                        onEnded={() => setIsPlaying(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                Aberto em {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
              {ticket.setor && <span>• {ticket.setor}</span>}
            </div>
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="flex flex-1 flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conversa</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto">
              {interactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma mensagem ainda
                </p>
              ) : (
                interactions.map((interaction) => {
                  const isOwnMessage = interaction.autor?.id === user?.id;
                  return (
                    <div
                      key={interaction.id}
                      className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={interaction.autor?.foto_perfil || undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {interaction.autor?.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          isOwnMessage
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-xs font-medium opacity-70">
                          {interaction.autor?.nome || 'Usuário'}
                        </p>
                        <p className="mt-1 text-sm whitespace-pre-wrap">{interaction.mensagem}</p>
                        <p className="mt-1 text-xs opacity-50">
                          {format(new Date(interaction.created_at), 'HH:mm', { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Message Input */}
            {canSendMessage && (
              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={sending}
                />
                <Button onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Feedback Dialog */}
      <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avaliar Atendimento</DialogTitle>
            <DialogDescription>
              Como foi sua experiência com este atendimento?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nota de satisfação</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Button
                    key={star}
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => setFeedbackRating(star)}
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= feedbackRating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground'
                      }`}
                    />
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedback-comment">Comentários (opcional)</Label>
              <Textarea
                id="feedback-comment"
                placeholder="Conte-nos mais sobre sua experiência..."
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowFeedback(false)}>
              Cancelar
            </Button>
            <Button
              onClick={submitFeedback}
              disabled={feedbackRating === 0 || submittingFeedback}
            >
              {submittingFeedback ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Enviar Avaliação
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
