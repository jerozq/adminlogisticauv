'use client'

import { useChat } from '@ai-sdk/react'
import { useState, useRef, useEffect } from 'react'
import { Bot, X, Send, Loader2, Sparkles } from 'lucide-react'

interface Props {
  contextData?: string
}

/** Extract text from UIMessage parts array (AI SDK v6+). */
function getMessageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('')
}

export function AssistantAI({ contextData }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')

  const { messages, sendMessage, status, setMessages } = useChat({
    id: 'logistica-assistant',
    transport: {
      toModelMessages: (msgs: any[]) =>
        msgs.map((m: any) => ({
          role: m.role,
          content: getMessageText(m.parts ?? []),
        })),
    } as any,
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({
      role: 'user',
      parts: [{ type: 'text' as const, text: input }],
    } as any, {
      body: {
        data: { context: contextData || 'Eres un asistente de Logística UV.' },
      },
    } as any)
    setInput('')
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 flex items-center justify-center size-14 rounded-full bg-blue-600 text-white shadow-xl hover:bg-blue-700 transition-transform ${isOpen ? 'scale-0' : 'scale-100 hover:scale-105'} ring-4 ring-blue-500/20`}
      >
        <Sparkles className="size-6" strokeWidth={1.5} />
      </button>

      {/* Modal / Popover del Chat */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-80 md:w-96 h-[500px] max-h-[80vh] flex flex-col rounded-3xl glass-panel shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-white/80 dark:bg-black/60 backdrop-blur-md border-b border-zinc-200 dark:border-white/10">
            <div className="flex items-center gap-2 text-foreground">
              <div className="flex items-center justify-center size-8 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">
                <Bot strokeWidth={1.5} className="size-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Asistente Proactivo</h3>
                <p className="text-[10px] text-foreground/50 leading-none">Powered by Gemini</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
            >
              <X strokeWidth={1.5} className="size-4 text-foreground/70" />
            </button>
          </div>

          {/* Área de mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-black/20">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-sm text-center">
                <Sparkles strokeWidth={1.5} className="size-8 mb-2 opacity-30" />
                <p>Hola Jero, ¿te ayudo a redactar una observación o resumir estos costos?</p>
              </div>
            )}
            
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-sm' 
                    : 'bg-white dark:bg-white/10 text-foreground ring-1 ring-zinc-200 dark:ring-transparent rounded-bl-sm shadow-sm'
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {getMessageText(m.parts)}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-white/10 ring-1 ring-zinc-200 dark:ring-transparent rounded-2xl rounded-bl-sm px-4 py-3 flex items-center justify-center shadow-sm">
                  <Loader2 strokeWidth={1.5} className="size-4 animate-spin text-zinc-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input text */}
          <form onSubmit={handleSubmit} className="p-3 bg-white/90 dark:bg-black/80 backdrop-blur-md border-t border-zinc-200 dark:border-white/10">
            <div className="flex items-center gap-2 pl-4 pr-1.5 py-1.5 bg-zinc-100 dark:bg-white/10 rounded-full border border-transparent focus-within:border-blue-300 dark:focus-within:border-blue-500/50 transition-colors">
              <input
                className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-foreground/40"
                value={input}
                placeholder="Escribe tu mensaje..."
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="p-2 rounded-full bg-blue-600 text-white disabled:bg-blue-400 dark:disabled:bg-blue-800 disabled:opacity-50 transition-colors"
                title="Enviar"
              >
                <Send strokeWidth={1.5} className="size-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

