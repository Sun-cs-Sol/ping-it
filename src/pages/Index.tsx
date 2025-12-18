import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Ticket, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  User,
  Loader2,
  Monitor,
  Wrench
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TicketFilters } from '@/components/tickets/TicketFilters';
import { BulkActions } from '@/components/tickets/BulkActions';

type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';

interface TicketData {
  id: string;
  protocolo: string;
  titulo: string;
  status: TicketStatus;
  prioridade: string;
  tipo: string | null;
  categoria: string | null;
  created_at: string;
}

const statusConfig: Record<TicketStatus, { label: string; color: string; icon: React.ReactNode }> = {
  aberto: { label: 'Aberto', color: 'bg-status-open text-white', icon: <AlertCircle className="h-4 w-4" /> },
  em_andamento: { label: 'Em Andamento', color: 'bg-status-in-progress text-white', icon: <Clock className="h-4 w-4" /> },
  aguardando_resposta: { label: 'Aguardando', color: 'bg-status-waiting text-white', icon: <Clock className="h-4 w-4" /> },
  resolvido: { label: 'Resolvido', color: 'bg-status-resolved text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
  fechado: { label: 'Fechado', color: 'bg-status-closed text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default function Index() {
  const { user, profile, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    abertos: 0,
    emAndamento: 0,
    resolvidos: 0,
  });
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && role) {
      if (role === 'agente_ti' || role === 'agente_manutencao' || role === 'admin') {
        navigate('/dashboard');
      }
    }
  }, [role, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchTickets();
    }
  }, [user, statusFilter, tipoFilter, periodoInicio, periodoFim]);

  const fetchTickets = async () => {
    try {
      let query = supabase
        .from('tickets')
        .select('id, protocolo, titulo, status, prioridade, tipo, categoria, created_at')
        .eq('solicitante_id', user?.id)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as TicketStatus);
      }
      
      if (tipoFilter !== 'all') {
        query = query.eq('tipo', tipoFilter);
      }
      
      if (periodoInicio) {
        query = query.gte('created_at', periodoInicio);
      }
      
      if (periodoFim) {
        query = query.lte('created_at', periodoFim + 'T23:59:59');
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      const ticketsData = (data || []) as TicketData[];
      setTickets(ticketsData);

      // Calculate stats
      const abertos = ticketsData.filter(t => t.status === 'aberto').length;
      const emAndamento = ticketsData.filter(t => ['em_andamento', 'aguardando_resposta'].includes(t.status)).length;
      const resolvidos = ticketsData.filter(t => ['resolvido', 'fechado'].includes(t.status)).length;
      setStats({ abertos, emAndamento, resolvidos });
      
      // Clear selections
      setSelectedIds([]);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };
  
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };
  
  const handleSelectAll = () => {
    setSelectedIds(tickets.map(t => t.id));
  };
  
  const handleDeselectAll = () => {
    setSelectedIds([]);
  };
  
  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .in('id', selectedIds);
      
      if (error) throw error;
      
      toast({
        title: 'Tickets excluídos',
        description: `${selectedIds.length} ticket(s) excluído(s) com sucesso`,
      });
      
      fetchTickets();
    } catch (error) {
      console.error('Error deleting tickets:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir os tickets',
        variant: 'destructive',
      });
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png" 
              alt="Grupo Astrotur" 
              className="h-10 object-contain"
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-foreground">Ticket TI</h1>
              <p className="text-xs text-muted-foreground">Help Desk</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.foto_perfil || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {profile?.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block">
                <p className="text-sm font-medium">{profile?.nome || 'Usuário'}</p>
                <p className="text-xs text-muted-foreground">{profile?.setor || ''}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-status-open">
            <CardHeader className="pb-2">
              <CardDescription>Tickets Abertos</CardDescription>
              <CardTitle className="text-3xl">{stats.abertos}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-status-in-progress">
            <CardHeader className="pb-2">
              <CardDescription>Em Andamento</CardDescription>
              <CardTitle className="text-3xl">{stats.emAndamento}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-status-resolved">
            <CardHeader className="pb-2">
              <CardDescription>Resolvidos</CardDescription>
              <CardTitle className="text-3xl">{stats.resolvidos}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tickets List */}
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Meus Tickets</CardTitle>
              <CardDescription>Suas solicitações recentes</CardDescription>
            </div>
            <TicketFilters
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              tipoFilter={tipoFilter}
              onTipoChange={setTipoFilter}
              periodoInicio={periodoInicio}
              onPeriodoInicioChange={setPeriodoInicio}
              periodoFim={periodoFim}
              onPeriodoFimChange={setPeriodoFim}
              showTipoFilter={true}
              showAdvancedFilters={false}
            />
          </CardHeader>
          <CardContent>
            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="mb-4">
                <BulkActions
                  selectedIds={selectedIds}
                  totalCount={tickets.length}
                  onSelectAll={handleSelectAll}
                  onDeselectAll={handleDeselectAll}
                  onDelete={handleDelete}
                  isAllSelected={selectedIds.length === tickets.length}
                />
              </div>
            )}
            
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-12 text-center">
                <Ticket className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">Nenhum ticket ainda</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Clique no botão abaixo para abrir sua primeira solicitação
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent"
                  >
                    <Checkbox
                      checked={selectedIds.includes(ticket.id)}
                      onCheckedChange={() => toggleSelection(ticket.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Link
                      to={`/ticket/${ticket.id}`}
                      className="flex flex-1 items-center gap-4"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        {ticket.tipo === 'Manutenção predial' ? (
                          <Wrench className="h-5 w-5 text-primary" />
                        ) : (
                          <Monitor className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">
                            {ticket.protocolo}
                          </span>
                          <Badge className={statusConfig[ticket.status].color}>
                            {statusConfig[ticket.status].icon}
                            <span className="ml-1">{statusConfig[ticket.status].label}</span>
                          </Badge>
                          {ticket.tipo && (
                            <Badge variant="outline" className="text-xs">
                              {ticket.tipo === 'Manutenção predial' ? 'Manutenção' : ticket.tipo}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 truncate font-medium">{ticket.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.categoria && `${ticket.categoria} • `}
                          {format(new Date(ticket.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Floating Action Button */}
      <Link
        to="/novo-ticket"
        className="fixed bottom-6 right-6 z-50"
      >
        <Button 
          size="lg" 
          className="h-14 gap-2 rounded-full px-6 shadow-lg transition-transform hover:scale-105"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">Solicitar Suporte</span>
        </Button>
      </Link>
    </div>
  );
}
