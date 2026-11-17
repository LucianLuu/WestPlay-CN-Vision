// WestPlay: Live radio player controller (crates/host/src/radio.rs).
// Runs in the hidden WebView2 hosting https://www.ximalaya.com/
;(() => {
  if (!location.hostname.includes('ximalaya.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  let sound = null
  let currentAudio = null
  let currentTrack = null
  let playAttemptSeq = 0
  let hls = null
  const PlayerHls = window.Hls
  let controller = null
  let retryTimer = null
  let watchdog = null
  let retries = 0
  let wanted = false
  let status = 'paused'
  let error = null
  let requestId = null
  let volume = 1
  let cab = null
  const radioRoot = 'https://mobile.ximalaya.com/radio-first-page-app'

  const radioJson = async (path, signal) => {
    const response = await fetch(radioRoot + path, { signal: signal || AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error('Radio HTTP ' + response.status)
    const payload = await response.json()
    if (payload.ret !== 0 && payload.ret !== '0000') throw new Error(payload.msg || 'Radio request failed')
    return payload.data ?? payload.result
  }

  const applyCab = () => {
    if (!sound || !cab) return
    if (cab.speakers) sound.speakers(cab.speakers)
    if (cab.head) sound.head(cab.head)
    sound.outside(cab.outside, cab.distance)
    sound.equalizer(cab.equalizer)
    sound.spectrum(cab.spectrum)
  }

  const toCoverUrl = (item) => {
    if (!item) return null
    let url =
      item.coverLarge ||
      item.coverPath ||
      item.cover_path ||
      item.coverMiddle ||
      item.coverSmall ||
      item.coverUrl ||
      item.albumCoverUrl290 ||
      item.cover ||
      item.artwork ||
      item.picUrl ||
      null
    if (typeof url !== 'string' || !url.trim()) return null
    url = url.trim()
    if (url.startsWith('//')) {
      url = 'https:' + url
    } else if (url.startsWith('http://')) {
      url = 'https://' + url.slice(7)
    } else if (!url.startsWith('http')) {
      url = url.startsWith('/') ? 'https://imagev2.xmcdn.com' + url : 'https://imagev2.xmcdn.com/' + url
    }
    return url
  }

  const sendPlayback = () => {
    if (!currentTrack) return
    post({
      type: 'playback',
      playback: {
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || 'Radio',
        artwork: toCoverUrl(currentTrack),
        status,
        radioId: currentTrack.radioId,
        requestId,
        error,
      },
    })
  }

  const hookAudio = (el) => {
    if (currentAudio) return
    currentAudio = el
    if (window.westplayCabSound) sound = window.westplayCabSound(el, (bars) => post({ type: 'spectrum', bars }))
    applyCab()
    el.addEventListener('playing', () => {
      if (!wanted || el.paused) {
        el.pause()
        return
      }
      clearTimeout(watchdog)
      status = 'playing'
      error = null
      sendPlayback()
    })
    el.addEventListener('pause', () => {
      if (!wanted || status !== 'playing') return
      status = 'paused'
      sendPlayback()
    })
    el.addEventListener('waiting', () => {
      if (!wanted) return
      status = 'loading'
      sendPlayback()
      armWatchdog(playAttemptSeq, currentTrack)
    })
    el.addEventListener('error', () => {
      if (wanted && el.error) failed(playAttemptSeq, currentTrack, 'Media error ' + el.error.code)
    })
    el.addEventListener('ended', () => {
      if (wanted) failed(playAttemptSeq, currentTrack, 'Live stream ended')
    })
  }

  const ensureAudio = () => {
    if (currentAudio) return currentAudio
    const el = document.createElement('audio')
    el.id = 'wp-radio-audio'
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'
    ;(document.body || document.documentElement).appendChild(el)
    hookAudio(el)
    return el
  }

  const stopHls = () => {
    if (hls) {
      try {
        hls.destroy()
      } catch {}
      hls = null
    }
  }

  const valid = (seq, track) => wanted && seq === playAttemptSeq && currentTrack === track

  const cancel = (clear) => {
    ++playAttemptSeq
    wanted = false
    controller?.abort()
    controller = null
    clearTimeout(retryTimer)
    retryTimer = null
    clearTimeout(watchdog)
    stopHls()
    if (currentAudio) {
      currentAudio.pause()
      if (clear) {
        currentAudio.removeAttribute('src')
        currentAudio.load()
      }
    }
  }

  const armWatchdog = (seq, track) => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => failed(seq, track, 'Connection timed out'), 20000)
  }

  const failed = (seq, track, message) => {
    if (!valid(seq, track) || retryTimer) return
    clearTimeout(watchdog)
    status = 'loading'
    error = message
    controller?.abort()
    stopHls()
    currentAudio?.pause()
    if (retries < 2) {
      retries++
      retryTimer = setTimeout(() => {
        retryTimer = null
        if (valid(seq, track)) connect(seq, track)
      }, retries * 2000)
    } else {
      wanted = false
      status = 'failed'
    }
    sendPlayback()
  }

  const connect = async (seq, track) => {
    if (!valid(seq, track)) return
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    armWatchdog(seq, track)
    try {
      const audio = ensureAudio()
      audio.playbackRate = 1
      audio.volume = volume
      audio.muted = false
      const detail = await radioJson('/v1/radio?radioId=' + encodeURIComponent(track.radioId), signal)
      if (!valid(seq, track)) return
      track.title = detail.programName || detail.name
      track.artist = detail.name
      track.artwork = toCoverUrl(detail)
      const native = Boolean(audio.canPlayType('application/vnd.apple.mpegurl'))
      let streamUrl = native
        ? detail.playUrl?.aac64 || detail.playUrl?.aac24
        : detail.playUrl?.ts64 || detail.playUrl?.ts24 || detail.playUrl?.aac64
      if (!streamUrl) throw new Error('No live stream available')
      const parsed = new URL(streamUrl)
      if (parsed.protocol === 'http:' && /(^|\.)(ximalaya\.com|xmcdn\.com)$/.test(parsed.hostname))
        parsed.protocol = 'https:'
      if (parsed.protocol !== 'https:') throw new Error('Unsupported stream URL')
      streamUrl = parsed.href
      if (!native) {
        if (!PlayerHls?.isSupported()) throw new Error('HLS is not supported')
        const instance = new PlayerHls({
          enableWorker: false,
          manifestLoadingMaxRetry: 1,
          levelLoadingMaxRetry: 1,
          fragLoadingMaxRetry: 1,
        })
        stopHls()
        hls = instance
        instance.on(PlayerHls.Events.MEDIA_ATTACHED, () => {
          if (valid(seq, track) && hls === instance) instance.loadSource(streamUrl)
        })
        instance.on(PlayerHls.Events.MANIFEST_PARSED, () => {
          if (valid(seq, track) && hls === instance) audio.play().catch((e) => failed(seq, track, String(e)))
        })
        instance.on(PlayerHls.Events.ERROR, (_event, data) => {
          if (data?.fatal && hls === instance) failed(seq, track, data.details || 'HLS error')
        })
        instance.attachMedia(audio)
        sendPlayback()
        return
      }
      if (!valid(seq, track)) return
      audio.src = streamUrl
      await audio.play()
    } catch (e) {
      if (!valid(seq, track) || e.name === 'AbortError') return
      failed(seq, track, String(e.message || e))
    }
  }

  const playTrack = async (track) => {
    cancel(true)
    currentTrack = track
    wanted = true
    status = 'loading'
    error = null
    retries = 0
    sendPlayback()
    await connect(playAttemptSeq, track)
  }

  const handleAsk = async (id, question) => {
    try {
      let path = '/homePage'
      let kind = 'home'
      if (question.ask === 'radioList') {
        const params = new URLSearchParams({
          locationId: String(question.locationId),
          locationTypeId: String(question.locationTypeId),
          categoryId: String(question.categoryId),
          pageNum: String(question.pageNum),
          pageSize: '48',
        })
        path = '/search?' + params.toString()
        kind = 'list'
      } else if (question.ask === 'radioDetail') {
        path = '/v1/radio?radioId=' + encodeURIComponent(question.radioId)
        kind = 'detail'
      } else if (question.ask === 'radioSchedule') {
        path = '/v1/getProgramSchedules?device=ios&radioId=' + encodeURIComponent(question.radioId)
        kind = 'schedule'
      }
      const data = await radioJson(path)
      post({ type: 'answer', answer: { id, radio: { kind, data: data ?? null } } })
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err?.message || err) } })
    }
  }

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd
    if (action === 'play') {
      requestId = cmd.requestId ?? null
      if (cmd.track || currentTrack) await playTrack(cmd.track || currentTrack)
    } else if (action === 'pause') {
      requestId = cmd.requestId ?? requestId
      status = 'paused'
      cancel(true)
      sendPlayback()
    } else if (action === 'volume') {
      volume = Math.max(0, Math.min(1, cmd.percent / 100))
      if (currentAudio) currentAudio.volume = volume
    } else if (action === 'cab') {
      cab = cmd
      applyCab()
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }

  setInterval(() => {
    sound?.tick()
  }, 1000)

  setInterval(async () => {
    const seq = playAttemptSeq
    const track = currentTrack
    if (!track || !wanted) return
    try {
      const detail = await radioJson('/v1/radio?radioId=' + encodeURIComponent(track.radioId))
      if (!valid(seq, track)) return
      track.title = detail.programName || detail.name
      track.artist = detail.name
      track.artwork = toCoverUrl(detail)
      sendPlayback()
    } catch {
      /* Metadata failure must not interrupt audio. */
    }
  }, 60000)

  window.westplayRadioCommand = (cmd) => {
    handleHost(cmd)
  }
  window.chrome?.webview?.addEventListener('message', (event) => {
    try {
      const data = event.data
      handleHost(typeof data === 'string' ? JSON.parse(data) : data)
    } catch (e) {
      console.error('Radio IPC parse error', e)
    }
  })

  post({ type: 'ready' })
})()
