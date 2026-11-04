package nl.pandaos.launcher

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

// Spraakinvoer voor de microfoon-toets van beide toetsenborden (webapp: Keyboard.tsx via PandaBridge, en het
// Android-toetsenbord PandaKeyboardService). Gebruikt de spraakherkenning van Android (meestal die van de Google-app).
// Tussenresultaten komen binnen terwijl je praat; het eindresultaat wordt ingevoegd.
class VoiceInput(
    private val context: Context,
    private val onPartial: (String) -> Unit,
    private val onFinal: (String) -> Unit,
    private val onState: (state: String, error: String?) -> Unit, // listening / idle / error
) {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    var listening = false
        private set

    fun hasPermission() = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    fun isAvailable() = SpeechRecognizer.isRecognitionAvailable(context)

    fun start(language: String) = main.post {
        if (!hasPermission()) { onState("error", "permission"); return@post }
        if (!isAvailable()) { onState("error", "unavailable"); return@post }
        stopInternal()
        val r = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { listening = true; onState("listening", null) }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onPartialResults(partialResults: Bundle?) {
                partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let(onPartial)
            }
            override fun onResults(results: Bundle?) {
                listening = false
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (text.isNotBlank()) onFinal(text)
                onState("idle", null)
                stopInternal()
            }
            override fun onError(error: Int) {
                listening = false
                val reason = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "nothing"
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
                    SpeechRecognizer.ERROR_AUDIO -> "audio"
                    else -> "error $error"
                }
                DiagLog.add("warn", "Spraakinvoer: $reason")
                onState("error", reason)
                stopInternal()
            }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        try { r.startListening(intent) } catch (e: Exception) { onState("error", e.message ?: "error"); stopInternal() }
    }

    fun stop() = main.post {
        recognizer?.stopListening() // geeft nog het eindresultaat van wat er al gezegd is
    }

    fun cancel() = main.post { stopInternal(); listening = false; onState("idle", null) }

    private fun stopInternal() {
        try { recognizer?.destroy() } catch (_: Exception) {}
        recognizer = null
    }
}
