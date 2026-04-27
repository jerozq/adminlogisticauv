import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages, createUIMessageStreamResponse } from 'ai';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages, data } = await req.json();

  const context = data?.context || "Eres el asistente de Logística y Operaciones. Responde de forma concisa y profesional.";

  const systemPrompt = `${context}
Instrucciones: 
- Jero es el operador de logística en campo. 
- Ayúdalo a resumir gastos, redactar observaciones formales de supervisión, o dar consejos basados en los datos. No inventes precios.
- Usa listas y formato MD.`;

  const result = streamText({
    model: google('gemini-2.0-flash'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    temperature: 0.2,
  });

  return result.toUIMessageStreamResponse();
}

