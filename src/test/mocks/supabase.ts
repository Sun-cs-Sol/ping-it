import { vi } from 'vitest';

export const mockSupabaseClient = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test' }, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'url' }, error: null }),
    })),
  },
  functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
  removeChannel: vi.fn(),
};

export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  ...overrides,
});

export const createMockProfile = (overrides = {}) => ({
  id: 'test-user-id',
  nome: 'Test User',
  email: 'test@example.com',
  setor: 'TI',
  ...overrides,
});

export const createMockTicket = (overrides = {}) => ({
  id: 'test-ticket-id',
  protocolo: 'TKT-123456',
  titulo: 'Test Ticket',
  descricao: 'Test description',
  tipo: 'TI',
  status: 'aberto',
  prioridade: 'media',
  ...overrides,
});

export const createMockSession = (user = createMockUser()) => ({
  access_token: 'mock-token',
  user,
});
