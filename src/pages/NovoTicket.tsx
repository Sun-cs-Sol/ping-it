import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  Camera, 
  Paperclip, 
  Mic, 
  MicOff, 
  X, 
  Loader2,
  FileText,
  Image as ImageIcon,
  Send
} from 'lucide-react';
import { z } from 'zod';

const ticketSchema = z.object({
  titulo: z.string().min(5, 'Título deve ter no mínimo 5 caracteres').max(100, 'Título deve ter no máximo 100 caracteres'),
  descricao: z.string().min(10, 'Descrição deve ter no mínimo 10 caracteres').max(2000, 'Descrição deve ter no máximo 2000 caracteres'),
});

interface Attachment {
  file: File;
  preview?: string;
  type: 'image' | 'file';
}

export default function NovoTicket() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            { file, preview: reader.result as string, type: 'image' },
          ]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      setAttachments((prev) => [...prev, { file, type: 'file' }]);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível acessar o microfone',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const removeAudio = () => {
    setAudioBlob(null);
  };

  // Upload file and return only the storage path (not public URL)
  const uploadFile = async (file: File | Blob, path: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(path, file);

    if (error) throw error;

    // Return just the path, not the public URL
    return data.path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      ticketSchema.parse({ titulo, descricao });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Erro de validação',
          description: error.errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado para criar um ticket',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload attachments - store paths only
      const uploadedImages: string[] = [];
      const uploadedFiles: string[] = [];
      let audioPath: string | null = null;

      for (const attachment of attachments) {
        const timestamp = Date.now();
        const path = `${user.id}/${timestamp}-${attachment.file.name}`;
        const storagePath = await uploadFile(attachment.file, path);

        if (attachment.type === 'image') {
          uploadedImages.push(storagePath);
        } else {
          uploadedFiles.push(storagePath);
        }
      }

      if (audioBlob) {
        const timestamp = Date.now();
        const path = `${user.id}/${timestamp}-audio.webm`;
        audioPath = await uploadFile(audioBlob, path);
      }

      // Create ticket with storage paths (not public URLs)
      const { data, error } = await supabase
        .from('tickets')
        .insert({
          solicitante_id: user.id,
          titulo,
          descricao,
          setor: profile?.setor || null,
          anexos: {
            imagens: uploadedImages,
            arquivos: uploadedFiles,
            audio: audioPath,
          },
        })
        .select('id, protocolo')
        .single();

      if (error) throw error;

      // Send confirmation email to requester
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            type: 'ticket_created',
            ticket: { id: data.id, protocolo: data.protocolo, titulo },
            recipient: { email: user.email, name: profile?.nome || user.email },
          },
        });
        console.log('[NovoTicket] Confirmation email sent to requester');
      } catch (emailError) {
        console.error('[NovoTicket] Error sending confirmation email:', emailError);
        // Don't fail ticket creation if email fails
      }

      // Send alert to IT agents and admins
      try {
        const { data: itStaff } = await supabase
          .from('profiles')
          .select('email, nome')
          .in('id', 
            (await supabase
              .from('user_roles')
              .select('user_id')
              .in('role', ['admin', 'agente_ti'])
            ).data?.map(r => r.user_id) || []
          );

        if (itStaff && itStaff.length > 0) {
          for (const agent of itStaff) {
            await supabase.functions.invoke('send-notification', {
              body: {
                type: 'new_ticket_alert',
                ticket: { 
                  id: data.id, 
                  protocolo: data.protocolo, 
                  titulo, 
                  descricao,
                  solicitante: profile?.nome || user.email 
                },
                recipient: { email: agent.email, name: agent.nome },
              },
            });
          }
          console.log(`[NovoTicket] Alert sent to ${itStaff.length} IT staff members`);
        }
      } catch (alertError) {
        console.error('[NovoTicket] Error sending IT alert:', alertError);
        // Don't fail ticket creation if alert fails
      }

      toast({
        title: 'Ticket criado!',
        description: `Protocolo: ${data.protocolo}`,
      });

      navigate(`/ticket/${data.id}`);
    } catch (error: unknown) {
      console.error('Error creating ticket:', error);
      
      let errorMessage = 'Não foi possível criar o ticket. Tente novamente.';
      
      // Check for network errors
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
      } else if (error instanceof Error && error.message.includes('network')) {
        errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
      }
      
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="container flex h-16 items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Nova Solicitação</h1>
            <p className="text-xs text-muted-foreground">Descreva seu problema</p>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="container py-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Abrir Ticket de Suporte</CardTitle>
            <CardDescription>
              Preencha as informações abaixo para que possamos ajudá-lo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Título */}
              <div className="space-y-2">
                <Label htmlFor="titulo">Título do Problema *</Label>
                <Input
                  id="titulo"
                  placeholder="Ex: Computador não liga"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  maxLength={100}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {titulo.length}/100 caracteres
                </p>
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição Detalhada *</Label>
                <Textarea
                  id="descricao"
                  placeholder="Descreva o problema em detalhes: o que aconteceu, quando começou, qual o impacto..."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  maxLength={2000}
                  className="min-h-[150px] resize-none"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {descricao.length}/2000 caracteres
                </p>
              </div>

              {/* Anexos */}
              <div className="space-y-4">
                <Label>Anexos (opcional)</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Foto/Screenshot
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="mr-2 h-4 w-4" />
                    Arquivo
                  </Button>
                  <Button
                    type="button"
                    variant={isRecording ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={isRecording ? stopRecording : startRecording}
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="mr-2 h-4 w-4" />
                        Parar Gravação
                      </>
                    ) : (
                      <>
                        <Mic className="mr-2 h-4 w-4" />
                        Gravar Áudio
                      </>
                    )}
                  </Button>
                </div>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {/* Preview de anexos */}
                {(attachments.length > 0 || audioBlob) && (
                  <div className="rounded-lg border p-4">
                    <p className="mb-3 text-sm font-medium">Arquivos anexados:</p>
                    <div className="flex flex-wrap gap-3">
                      {attachments.map((attachment, index) => (
                        <div
                          key={index}
                          className="relative flex items-center gap-2 rounded-lg border bg-muted/50 p-2"
                        >
                          {attachment.type === 'image' && attachment.preview ? (
                            <img
                              src={attachment.preview}
                              alt="Preview"
                              className="h-12 w-12 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                              {attachment.type === 'image' ? (
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              ) : (
                                <FileText className="h-6 w-6 text-muted-foreground" />
                              )}
                            </div>
                          )}
                          <span className="max-w-[100px] truncate text-xs">
                            {attachment.file.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeAttachment(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {audioBlob && (
                        <div className="relative flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
                          <div className="flex h-12 w-12 items-center justify-center rounded bg-primary/10">
                            <Mic className="h-6 w-6 text-primary" />
                          </div>
                          <span className="text-xs">Áudio gravado</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={removeAudio}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isRecording && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-destructive" />
                    <span className="text-sm text-destructive">Gravando áudio...</span>
                  </div>
                )}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Send className="mr-2 h-5 w-5" />
                )}
                Enviar Solicitação
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
