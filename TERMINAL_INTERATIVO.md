# Lapidatto Frontend Factory - Resolução do Problema de Terminal Interativo

## Problema Identificado

O terminal interativo estava reiniciando constantemente porque o `tsx watch` detectava mudanças nos arquivos e reiniciava o processo, interrompendo a entrada do usuário.

## Soluções Implementadas

### 1. Script Específico para Modo Interativo

Foi criado um novo script `dev:interactive` que executa sem o modo watch:

```bash
# Para desenvolvimento com hot-reload (sem terminal interativo)
npm run dev

# Para modo interativo (sem hot-reload)
npm run dev:interactive
```

### 2. Configuração TSX

Foi criado o arquivo `tsx.config.json` para excluir diretórios que não devem causar restart:

```json
{
  "watch": {
    "exclude": [
      ".lapidatto/**",
      "dist/**", 
      "node_modules/**",
      "*.log"
    ]
  }
}
```

### 3. Melhorias no Código

- Adicionado handlers para `SIGINT` e `SIGTERM` para cleanup adequado
- Melhorado o tratamento de interrupções no terminal interativo
- Configurações mais robustas para o readline interface

## Como Usar

### Para Desenvolvimento com Hot-Reload
```bash
npm run dev
```
Use este modo quando estiver editando código e quiser que as mudanças sejam recarregadas automaticamente. O terminal interativo ficará desabilitado neste modo.

### Para Usar o Terminal Interativo
```bash
npm run dev:interactive
```
Use este modo quando quiser usar o terminal interativo para gerar projetos. O hot-reload ficará desabilitado para não interferir com a entrada do usuário.

### Para Desabilitar Completamente o Modo Interativo
```bash
LAPIDATTO_NO_INTERACTIVE=1 npm run dev
```

## API Endpoints

Mesmo com o terminal interativo desabilitado, você pode usar a API REST:

- `POST /generate-project` - Gerar novo projeto
- `POST /approve/spec` - Aprovar especificação
- `GET /jobs/:jobId` - Ver status do job
- `GET /downloads/:jobId` - Baixar projeto gerado

## Recomendações

1. **Durante o desenvolvimento**: Use `npm run dev` para ter hot-reload
2. **Para gerar projetos**: Use `npm run dev:interactive` 
3. **Em produção**: Use `npm run build && npm start`

## Exemplo de Uso do Terminal Interativo

```bash
npm run dev:interactive

# O terminal irá solicitar:
# - Nome do projeto
# - Briefing/descrição
# - Template (opcional, padrão: nextjs-base)
# - Público-alvo (opcional)
# - Metas principais (opcional)
# - Funcionalidades-chave (opcional)  
# - Aprovação automática do spec (s/N)
```

O terminal agora deve funcionar corretamente sem reinicializações inesperadas.
