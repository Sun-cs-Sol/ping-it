import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Filter, X } from 'lucide-react';

interface TicketFiltersProps {
  statusFilter: string;
  onStatusChange: (value: string) => void;
  tipoFilter: string;
  onTipoChange: (value: string) => void;
  periodoInicio?: string;
  onPeriodoInicioChange: (value: string) => void;
  periodoFim?: string;
  onPeriodoFimChange: (value: string) => void;
  setorFilter?: string;
  onSetorChange?: (value: string) => void;
  ratingMin?: number;
  onRatingMinChange?: (value: number | undefined) => void;
  showTipoFilter?: boolean;
  showAdvancedFilters?: boolean;
}

export function TicketFilters({
  statusFilter,
  onStatusChange,
  tipoFilter,
  onTipoChange,
  periodoInicio,
  onPeriodoInicioChange,
  periodoFim,
  onPeriodoFimChange,
  setorFilter,
  onSetorChange,
  ratingMin,
  onRatingMinChange,
  showTipoFilter = true,
  showAdvancedFilters = false,
}: TicketFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const hasActiveFilters = 
    statusFilter !== 'all' || 
    tipoFilter !== 'all' || 
    periodoInicio || 
    periodoFim || 
    (setorFilter && setorFilter !== 'all') ||
    (ratingMin && ratingMin > 0);

  const clearFilters = () => {
    onStatusChange('all');
    onTipoChange('all');
    onPeriodoInicioChange('');
    onPeriodoFimChange('');
    if (onSetorChange) onSetorChange('all');
    if (onRatingMinChange) onRatingMinChange(undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status Filter */}
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
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

      {/* Tipo Filter */}
      {showTipoFilter && (
        <Select value={tipoFilter} onValueChange={onTipoChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            <SelectItem value="TI">TI</SelectItem>
            <SelectItem value="Manutenção predial">Manutenção Predial</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Advanced Filters Popover */}
      {showAdvancedFilters && (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
              {hasActiveFilters && (
                <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filtros Avançados</h4>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="mr-1 h-3 w-3" />
                    Limpar
                  </Button>
                )}
              </div>

              {/* Período */}
              <div className="space-y-2">
                <Label>Período</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={periodoInicio || ''}
                    onChange={(e) => onPeriodoInicioChange(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="date"
                    value={periodoFim || ''}
                    onChange={(e) => onPeriodoFimChange(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Setor */}
              {onSetorChange && (
                <div className="space-y-2">
                  <Label>Setor</Label>
                  <Select value={setorFilter || 'all'} onValueChange={onSetorChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os Setores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Setores</SelectItem>
                      <SelectItem value="Administrativo">Administrativo</SelectItem>
                      <SelectItem value="Comercial">Comercial</SelectItem>
                      <SelectItem value="Financeiro">Financeiro</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Operações">Operações</SelectItem>
                      <SelectItem value="Recursos Humanos">Recursos Humanos</SelectItem>
                      <SelectItem value="TI">TI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Rating Mínimo */}
              {onRatingMinChange && (
                <div className="space-y-2">
                  <Label>Avaliação Mínima</Label>
                  <Select 
                    value={ratingMin?.toString() || 'any'} 
                    onValueChange={(v) => onRatingMinChange(v === 'any' ? undefined : parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Qualquer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      <SelectItem value="1">1+ estrela</SelectItem>
                      <SelectItem value="2">2+ estrelas</SelectItem>
                      <SelectItem value="3">3+ estrelas</SelectItem>
                      <SelectItem value="4">4+ estrelas</SelectItem>
                      <SelectItem value="5">5 estrelas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
