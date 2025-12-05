import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Ticket, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  User,
  Loader2,
  BarChart3,
  Users,
  Star,
  Filter,
  Settings
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';

interface TicketData {
  id: string;
  protocolo: string;
  titulo: string;
  status: TicketStatus;
  prioridade: string;
  setor: string | null;
  created_at: string;
  solicitante: {
    id: string;
    nome: string;
    foto_perfil: string | null;
  } | null;
}

const statusConfig: Record<TicketStatus, { label: string; color: string; icon: React.ReactNode }> = {
  aberto: { label: 'Aberto', color: 'bg-status-open text-white', icon: <AlertCircle className="h-4 w-4" /> },
  em_andamento: { label: 'Em Andamento', color: 'bg-status-in-progress text-white', icon: <Clock className="h-4 w-4" /> },
  aguardando_resposta: { label: 'Aguardando', color: 'bg-status-waiting text-white', icon: <Clock className="h-4 w-4" /> },
  resolvido: { label: 'Resolvido', color: 'bg-status-resolved text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
  fechado: { label: 'Fechado', color: 'bg-status-closed text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
};

const priorityColors: Record<string, string> = {
  baixa: 'bg-priority-low text-white',
  media: 'bg-priority-medium text-white',
  alta: 'bg-priority-high text-white',
  critica: 'bg-priority-critical text-white',
};

export default function Dashboard() {
  const { user, profile, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stats, setStats] = useState({
    novosHoje: 0,
    emAtendimento: 0,
    resolvidos: 0,
    satisfacaoMedia: 0,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && role === 'solicitante') {
      navigate('/');
    }
  }, [role, authLoading, navigate]);

  useEffect(() => {
    if (user && (role === 'agente_ti' || role === 'admin')) {
      fetchTickets();
      fetchStats();
    }
  }, [user, role, statusFilter]);

  const fetchTickets = async () => {
    try {
      let query = supabase
        .from('tickets')
        .select(`
          id,
          protocolo,
          titulo,
          status,
          prioridade,
          setor,
          created_at,
          solicitante:profiles!tickets_solicitante_id_fkey(id, nome, foto_perfil)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as TicketStatus);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      setTickets(data as unknown as TicketData[]);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // New tickets today
      const { count: novosHoje } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      // In progress
      const { count: emAtendimento } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['em_andamento', 'aguardando_resposta']);

      // Resolved this month
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const { count: resolvidos } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['resolvido', 'fechado'])
        .gte('updated_at', firstDayOfMonth.toISOString());

      // Average satisfaction
      const { data: feedbacks } = await supabase
        .from('feedbacks')
        .select('nota_satisfacao')
        .gte('created_at', firstDayOfMonth.toISOString());

      const satisfacaoMedia = feedbacks && feedbacks.length > 0
        ? feedbacks.reduce((acc, f) => acc + (f.nota_satisfacao || 0), 0) / feedbacks.length
        : 0;

      setStats({
        novosHoje: novosHoje || 0,
        emAtendimento: emAtendimento || 0,
        resolvidos: resolvidos || 0,
        satisfacaoMedia: Math.round(satisfacaoMedia * 10) / 10,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
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
              <p className="text-xs text-muted-foreground">Painel do Agente</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="hidden sm:flex">
              {role === 'admin' ? 'Administrador' : 'Agente TI'}
            </Badge>
            {role === 'admin' && (
              <Link to="/admin">
                <Button variant="outline" size="sm" className="hidden sm:flex">
                  <Settings className="mr-2 h-4 w-4" />
                  Administração
                </Button>
                <Button variant="outline" size="icon" className="sm:hidden">
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.foto_perfil || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {profile?.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block">
                <p className="text-sm font-medium">{profile?.nome || 'Agente'}</p>
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
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-status-open">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Novos Hoje</CardDescription>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.novosHoje}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-status-in-progress">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Em Atendimento</CardDescription>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.emAtendimento}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-status-resolved">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Resolvidos (mês)</CardDescription>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.resolvidos}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-yellow-400">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Satisfação Média</CardDescription>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{stats.satisfacaoMedia}</span>
                <span className="text-muted-foreground">/5</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tickets List */}
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Tickets</CardTitle>
              <CardDescription>Gerencie as solicitações de suporte</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="aberto">Abertos</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="aguardando_resposta">Aguardando</SelectItem>
                  <SelectItem value="resolvido">Resolvidos</SelectItem>
                  <SelectItem value="fechado">Fechados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
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
                <h3 className="mt-4 text-lg font-medium">Nenhum ticket encontrado</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Não há tickets com o filtro selecionado
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    to={`/ticket/${ticket.id}`}
                    className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={ticket.solicitante?.foto_perfil || undefined} />
                      <AvatarFallback className="bg-muted">
                        {ticket.solicitante?.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          {ticket.protocolo}
                        </span>
                        <Badge className={statusConfig[ticket.status].color}>
                          {statusConfig[ticket.status].label}
                        </Badge>
                        <Badge className={priorityColors[ticket.prioridade]}>
                          {ticket.prioridade.charAt(0).toUpperCase() + ticket.prioridade.slice(1)}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate font-medium">{ticket.titulo}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{ticket.solicitante?.nome || 'Usuário'}</span>
                        {ticket.setor && <span>• {ticket.setor}</span>}
                        <span>• {format(new Date(ticket.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
