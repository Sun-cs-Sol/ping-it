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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { 
  ArrowLeft, 
  Send, 
  FileText, 
  Play,
  Pause,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  Building,
  Briefcase,
  Mail,
  Settings2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getSignedUrl, getSignedUrls } from '@/lib/storage';

type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';
type TicketPriority = 'baixa' | 'media' | 'alta' | 'critica';

interface TicketData {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  status: TicketStatus;
  prioridade: TicketPriority;
  setor: string | null;
  anexos: {
    imagens: string[];
    arquivos: string[];
    audio: string | null;
  };
  created_at: string;
  agente_id: string | null;
  solicitante: {
    id: string;
    nome: string;
    email: string;
    telefone: string | null;
    funcao: string | null;
    setor: string | null;
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

const statusConfig: Record<TicketStatus, { label: string; color: string }> = {
  aberto: { label: 'Aberto', color: 'bg-status-open text-white' },
  em_andamento: { label: 'Em Andamento', color: 'bg-status-in-progress text-white' },
  aguardando_resposta: { label: 'Aguardando Resposta', color: 'bg-status-waiting text-white' },
  resolvido: { label: 'Resolvido', color: 'bg-status-resolved text-white' },
  fechado: { label: 'Fechado', color: 'bg-status-closed text-white' },
};

const priorityConfig: Record<TicketPriority, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'bg-priority-low text-white' },
  media: { label: 'Média', color: 'bg-priority-medium text-white' },
  alta: { label: 'Alta', color: 'bg-priority-high text-white' },
  critica: { label: 'Crítica', color: 'bg-priority-critical text-white' },
};

export default function TicketWorkspace() {
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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [signedUrls, setSignedUrls] = useState<SignedUrls>({ imagens: [], arquivos: [], audio: null });
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || (role !== 'agente_ti' && role !== 'agente_manutencao' && role !== 'admin')) {
      navigate('/');
      return;
    }
    if (id) {
      fetchTicket();
      fetchInteractions();
    }
  }, [id, user, role]);

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
      .channel(`agent-ticket-${id}`)
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchTicket = async () => {
    try {
      const { data: ticketData, error } = await supabase
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
          agente_id,
          solicitante_id
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Fetch solicitante profile separately
      let solicitante = null;
      if (ticketData.solicitante_id) {
        const { data: solicitanteData } = await supabase
          .from('profiles')
          .select('id, nome, email, telefone, funcao, setor, foto_perfil')
          .eq('id', ticketData.solicitante_id)
          .maybeSingle();
        solicitante = solicitanteData;
      }

      setTicket({
        ...ticketData,
        solicitante,
      } as unknown as TicketData);
    } catch (error) {
      console.error('Error fetching ticket:', error);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchInteractions = async () => {
    try {
      const { data: interactionsData, error } = await supabase
        .from('interactions')
        .select(`
          id,
          mensagem,
          tipo,
          created_at,
          autor_id
        `)
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch author profiles separately
      const autorIds = [...new Set(interactionsData?.map(i => i.autor_id).filter(Boolean))];
      
      let profilesMap: Record<string, { id: string; nome: string; foto_perfil: string | null }> = {};
      
      if (autorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nome, foto_perfil')
          .in('id', autorIds);
        
        profilesData?.forEach(p => {
          profilesMap[p.id] = p;
        });
      }

      const interactionsWithAuthor = interactionsData?.map(i => ({
        ...i,
        autor: i.autor_id ? profilesMap[i.autor_id] || null : null,
      }));

      setInteractions(interactionsWithAuthor as unknown as Interaction[]);
    } catch (error) {
      console.error('Error fetching interactions:', error);
    }
  };

  const updateStatus = async (newStatus: TicketStatus) => {
    if (!id || !user) return;

    setUpdatingStatus(true);
    try {
      const updateData: Record<string, unknown> = { status: newStatus };
      
      // Assign agent if not assigned
      if (!ticket?.agente_id && newStatus === 'em_andamento') {
        updateData.agente_id = user.id;
      }

      // Set closed_at if closing
      if (newStatus === 'fechado') {
        updateData.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Add status change interaction
      await supabase.from('interactions').insert({
        ticket_id: id,
        autor_id: user.id,
        mensagem: `Status alterado para: ${statusConfig[newStatus].label}`,
        tipo: 'mudanca_status',
      });

      setTicket((prev) => prev ? { ...prev, status: newStatus, agente_id: updateData.agente_id as string || prev.agente_id } : null);

      // Send email notifications to requester
      if (ticket?.solicitante?.email) {
        try {
          // Send status update email
          await supabase.functions.invoke('send-notification', {
            body: {
              type: 'status_updated',
              ticket: { 
                id, 
                protocolo: ticket.protocolo, 
                titulo: ticket.titulo,
                newStatus 
              },
              recipient: { 
                email: ticket.solicitante.email, 
                name: ticket.solicitante.nome 
              },
            },
          });
          console.log('[TicketWorkspace] Status update email sent');

          // If resolved, send feedback request
          if (newStatus === 'resolvido') {
            await supabase.functions.invoke('send-notification', {
              body: {
                type: 'feedback_request',
                ticket: { 
                  id, 
                  protocolo: ticket.protocolo, 
                  titulo: ticket.titulo 
                },
                recipient: { 
                  email: ticket.solicitante.email, 
                  name: ticket.solicitante.nome 
                },
              },
            });
            console.log('[TicketWorkspace] Feedback request email sent');
          }
        } catch (emailError) {
          console.error('[TicketWorkspace] Error sending notification:', emailError);
          // Don't fail status update if email fails
        }
      }
      
      toast({
        title: 'Status atualizado',
        description: `Ticket marcado como ${statusConfig[newStatus].label}`,
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status',
        variant: 'destructive',
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const updatePriority = async (newPriority: TicketPriority) => {
    if (!id) return;

    setUpdatingPriority(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ prioridade: newPriority })
        .eq('id', id);

      if (error) throw error;

      setTicket((prev) => prev ? { ...prev, prioridade: newPriority } : null);
      
      toast({
        title: 'Prioridade atualizada',
      });
    } catch (error) {
      console.error('Error updating priority:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a prioridade',
        variant: 'destructive',
      });
    } finally {
      setUpdatingPriority(false);
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

  const hasAttachments = signedUrls.imagens.some(Boolean) || 
                         signedUrls.arquivos.some(Boolean) || 
                         signedUrls.audio;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="container flex h-16 items-center gap-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">
                {ticket.protocolo}
              </span>
            </div>
            <h1 className="truncate text-lg font-semibold">{ticket.titulo}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile Controls Button */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden">
                  <Settings2 className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <SheetHeader>
                  <SheetTitle>Gerenciar Ticket</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select
                      value={ticket.status}
                      onValueChange={(value) => updateStatus(value as TicketStatus)}
                      disabled={updatingStatus}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aberto">Aberto</SelectItem>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="aguardando_resposta">Aguardando Resposta</SelectItem>
                        <SelectItem value="resolvido">Resolvido</SelectItem>
                        <SelectItem value="fechado">Fechado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Prioridade</label>
                    <Select
                      value={ticket.prioridade}
                      onValueChange={(value) => updatePriority(value as TicketPriority)}
                      disabled={updatingPriority}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="critica">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Badge className={statusConfig[ticket.status].color}>
                      {statusConfig[ticket.status].label}
                    </Badge>
                    <Badge className={priorityConfig[ticket.prioridade].color}>
                      {priorityConfig[ticket.prioridade].label}
                    </Badge>
                  </div>
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-medium">Solicitante</p>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={ticket.solicitante?.foto_perfil || undefined} />
                        <AvatarFallback className="bg-muted">
                          {ticket.solicitante?.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{ticket.solicitante?.nome || 'Usuário'}</p>
                        <p className="text-xs text-muted-foreground">{ticket.solicitante?.funcao || ''}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container flex flex-1 gap-4 py-4">
        {/* Main Area - Chat */}
        <div className="flex flex-1 flex-col gap-4">
          {/* Ticket Description */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Descrição</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ticket.descricao}</p>
              
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
                        className="block h-20 w-20 overflow-hidden rounded-lg border hover:opacity-80"
                      >
                        <img
                          src={img}
                          alt={`Anexo ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ))}
                    {signedUrls.arquivos.map((file, i) => file && (
                      <a
                        key={i}
                        href={file}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border bg-muted hover:bg-accent"
                      >
                        <FileText className="h-6 w-6 text-muted-foreground" />
                        <span className="mt-1 text-xs">Arquivo</span>
                      </a>
                    ))}
                    {signedUrls.audio && (
                      <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-12 w-12"
                          onClick={toggleAudio}
                        >
                          {isPlaying ? (
                            <Pause className="h-6 w-6" />
                          ) : (
                            <Play className="h-6 w-6" />
                          )}
                        </Button>
                        <span className="text-sm">Áudio do solicitante</span>
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
            </CardContent>
          </Card>

          {/* Chat */}
          <Card className="flex flex-1 flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conversa</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto max-h-[400px]">
                {interactions.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma mensagem ainda
                  </p>
                ) : (
                  interactions.map((interaction) => {
                    const isOwnMessage = interaction.autor?.id === user?.id;
                    const isStatusChange = interaction.tipo === 'mudanca_status';
                    
                    if (isStatusChange) {
                      return (
                        <div key={interaction.id} className="flex justify-center">
                          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                            {interaction.mensagem}
                          </span>
                        </div>
                      );
                    }

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
              {ticket.status !== 'fechado' && (
                <div className="mt-4 flex gap-2">
                  <Input
                    placeholder="Digite sua resposta..."
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
        </div>

        {/* Sidebar */}
        <div className="hidden w-80 flex-col gap-4 lg:flex">
          {/* Status & Priority */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Gerenciar Ticket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={ticket.status}
                  onValueChange={(value) => updateStatus(value as TicketStatus)}
                  disabled={updatingStatus}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="aguardando_resposta">Aguardando Resposta</SelectItem>
                    <SelectItem value="resolvido">Resolvido</SelectItem>
                    <SelectItem value="fechado">Fechado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Prioridade</label>
                <Select
                  value={ticket.prioridade}
                  onValueChange={(value) => updatePriority(value as TicketPriority)}
                  disabled={updatingPriority}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="critica">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge className={statusConfig[ticket.status].color}>
                  {statusConfig[ticket.status].label}
                </Badge>
                <Badge className={priorityConfig[ticket.prioridade].color}>
                  {priorityConfig[ticket.prioridade].label}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* User Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Solicitante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={ticket.solicitante?.foto_perfil || undefined} />
                  <AvatarFallback className="bg-muted">
                    {ticket.solicitante?.nome?.charAt(0).toUpperCase() || <User className="h-5 w-5" />}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{ticket.solicitante?.nome || 'Usuário'}</p>
                  <p className="text-sm text-muted-foreground">{ticket.solicitante?.funcao || ''}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {ticket.solicitante?.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span className="truncate">{ticket.solicitante.email}</span>
                  </div>
                )}
                {ticket.solicitante?.telefone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{ticket.solicitante.telefone}</span>
                  </div>
                )}
                {ticket.solicitante?.setor && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building className="h-4 w-4" />
                    <span>{ticket.solicitante.setor}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Ticket Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Protocolo</span>
                <span className="font-mono">{ticket.protocolo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Setor</span>
                <span>{ticket.setor || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Criado em</span>
                <span>{format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
