/**
 * appCatalog.schema.js
 *
 * Documentación del schema para el catálogo de aplicaciones.
 *
 * Este archivo NO exporta nada. Es únicamente documentación viva
 * de la estructura de datos que usan todos los módulos del launcher.
 *
 * ─────────────────────────────────────────────────────────────
 *
 * ## CatalogEntry (entrada individual del catálogo)
 *
 *   id: string (obligatorio)
 *     Identificador único (ej: "winrar", "visual_studio_code")
 *     Se genera automáticamente desde normalizedName.
 *
 *   displayName: string (obligatorio)
 *     Nombre visible para el usuario (ej: "WinRAR", "Visual Studio Code")
 *
 *   normalizedName: string (obligatorio)
 *     Nombre normalizado (minúsculas, sin acentos, sin espacios extra)
 *     Ej: "winrar", "visual studio code"
 *
 *   aliases: string[] (opcional, default [])
 *     Lista de nombres alternativos normalizados.
 *     NO incluir frases como "abre winrar" — eso se limpia en el normalizador.
 *
 *   source: "installed" | "system" | "user" | "uwp" | "registry"
 *     Origen del descubrimiento de esta aplicación.
 *
 *   launchMethods: LaunchMethod[] (obligatorio, al menos 1)
 *     Métodos de lanzamiento ordenados por prioridad (mayor = mejor).
 *
 *   metadata: Metadata (obligatorio)
 *     Metadatos adicionales.
 *
 * ─────────────────────────────────────────────────────────────
 *
 * ## LaunchMethod
 *
 *   type: "uri" | "app_id" | "executable" | "shortcut" | "shell_command"
 *     Tipo de método de lanzamiento.
 *
 *   priority: number (0-100, default 50)
 *     Mayor prioridad se prueba primero.
 *
 *   // Campos según type:
 *
 *   type === "uri":
 *     value: string     // "ms-settings:", "mailto:", etc.
 *
 *   type === "app_id":
 *     value: string     // "Microsoft.Windows.Settings_8wekyb3d8bbwe!App"
 *
 *   type === "executable":
 *     path: string      // Ruta completa al .exe
 *     executable: string (opcional) // Solo el nombre del exe
 *     arguments: string[] (opcional)
 *     workingDirectory: string (opcional)
 *
 *   type === "shortcut":
 *     path: string      // Ruta completa al .lnk
 *     targetPath: string (opcional) // Resuelto del .lnk
 *
 *   type === "shell_command":
 *     command: string   // Comando shell a ejecutar
 *
 * ─────────────────────────────────────────────────────────────
 *
 * ## Metadata
 *
 *   publisher: string (opcional)
 *   version: string (opcional)
 *   discoveredAt: string (ISO date)
 *   lastVerifiedAt: string (ISO date, opcional)
 *   processNames: string[] (opcional)
 *     Nombres de proceso para verificación post-lanzamiento
 *     Ej: ["WinRAR.exe", "rar.exe"]
 *
 * ─────────────────────────────────────────────────────────────
 *
 * ## ResolvedApp (resultado de resolución)
 *
 *   catalogId: string
 *   displayName: string
 *   normalizedName: string
 *   confidence: number (0-1)
 *   resolutionMethod: "exact_alias" | "exact_name" | "word_match" | "fuzzy"
 *   launchMethod: LaunchMethod (el método seleccionado)
 *
 * ─────────────────────────────────────────────────────────────
 *
 * ## LaunchResult (resultado de lanzamiento)
 *
 *   success: boolean
 *   app: { id, name }
 *   resolution: { method, confidence }
 *   launch: { method, path?, uri?, appId? }
 *   verification: { verified, process?, reason? }
 *   durationMs: number
 *   error?: string
 *
 * ─────────────────────────────────────────────────────────────
 */
