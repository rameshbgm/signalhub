{{- define "status.name" -}}signalhub{{- end }}
{{- define "status.fullname" -}}
{{- printf "%s-signalhub" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}
{{- define "status.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "status.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}
{{- define "status.labels" -}}
app.kubernetes.io/name: {{ include "status.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
{{- define "status.secretName" -}}
{{- default (include "status.fullname" .) .Values.secrets.existingSecret -}}
{{- end }}
