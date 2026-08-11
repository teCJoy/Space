(function() {
    // ---- utility functions ----
    function formatTime(seconds) {
        if (seconds < 0) seconds = 0;
        var total = Math.floor(seconds);
        var hours = Math.floor(total / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        var secs = total % 60;
        var millis = Math.floor((seconds - total) * 1000);
        return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + '.' + String(millis).padStart(3, '0');
    }

    function extractBaseUrl(url) {
        if (!url) return '';
        var lastSlash = url.lastIndexOf('/');
        if (lastSlash === -1) return '';
        return url.substring(0, lastSlash + 1);
    }

    function isAbsoluteUrl(url) {
        return /^https?:\/\//i.test(url);
    }

    function resolveUrl(base, relative) {
        if (isAbsoluteUrl(relative)) return relative;
        if (base.endsWith('/')) return base + relative;
        return base + '/' + relative;
    }

    async function fetchContent(url, referer) {
        var headers = {};
        if (referer) {
            headers['Referer'] = referer;
        }
        var resp = await fetch(url, { headers: headers });
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + resp.statusText);
        return await resp.text();
    }

    async function followMaster(content, baseUrl, referer) {
        if (!content.includes('#EXT-X-STREAM-INF')) {
            return { content: content, baseUrl: baseUrl };
        }
        var lines = content.split(/\r?\n/);
        var subUrl = null;
        for (var i = 0; i < lines.length - 1; i++) {
            if (lines[i].includes('#EXT-X-STREAM-INF')) {
                var next = lines[i + 1].trim();
                if (next && !next.startsWith('#')) {
                    subUrl = next;
                    break;
                }
            }
        }
        if (!subUrl) throw new Error('Sub-playlist URL not found');
        var finalSubUrl = resolveUrl(baseUrl, subUrl);
        var subContent = await fetchContent(finalSubUrl, referer);
        var subBase = extractBaseUrl(finalSubUrl);
        return followMaster(subContent, subBase, referer);
    }

    function parseBlocks(content) {
        var lines = content.split(/\r?\n/);
        var blocks = [];
        var currentBlock = [];
        var currentDuration = 0;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('#EXTINF:')) {
                var match = line.match(/#EXTINF:([\d.]+)/);
                if (match) {
                    currentDuration = parseFloat(match[1]);
                }
                continue;
            }

            if (line.endsWith('.ts') || line.includes('.ts?')) {
                if (currentDuration > 0) {
                    currentBlock.push({ duration: currentDuration, file: line });
                    currentDuration = 0;
                }
                continue;
            }

            if (line.includes('#EXT-X-DISCONTINUITY')) {
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock);
                    currentBlock = [];
                }
                continue;
            }
        }
        if (currentBlock.length > 0) {
            blocks.push(currentBlock);
        }
        return blocks;
    }

    // ---- main analysis ----
    async function analyze(url, referer, minAdDur, maxAdDur) {
        var rawContent = await fetchContent(url, referer);
        var baseUrl = extractBaseUrl(url);

        var result = await followMaster(rawContent, baseUrl, referer);
        var finalContent = result.content;
        var finalBase = result.baseUrl;

        var blocks = parseBlocks(finalContent);
        if (blocks.length === 0) {
            throw new Error('No TS segments parsed, may not be a valid M3U8');
        }

        var blockInfos = blocks.map(function(block, idx) {
            var dur = 0;
            for (var i = 0; i < block.length; i++) {
                dur += block[i].duration;
            }
            var isFirstOrLast = (idx === 0 || idx === blocks.length - 1);
            var isAd = (!isFirstOrLast && dur >= minAdDur && dur <= maxAdDur);
            return {
                index: idx,
                segments: block,
                totalDuration: dur,
                isAd: isAd
            };
        });

        return {
            blocks: blocks,
            blockInfos: blockInfos,
            finalBase: finalBase,
            totalDuration: blockInfos.reduce(function(sum, b) { return sum + b.totalDuration; }, 0)
        };
    }

    // ---- dynamic script loading (only for hls.js) ----
    function loadScript(src, timeout) {
        timeout = timeout || 10000;
        return new Promise(function(resolve, reject) {
            var existing = document.querySelector('script[src="' + src + '"]');
            if (existing) {
                resolve();
                return;
            }
            var script = document.createElement('script');
            script.src = src;
            script.onload = function() {
                setTimeout(resolve, 200);
            };
            script.onerror = function() { reject(new Error('Failed to load script: ' + src)); };
            document.head.appendChild(script);
            setTimeout(function() {
                reject(new Error('Script load timeout: ' + src));
            }, timeout);
        });
    }

    // ---- DOM refs ----
    var urlInput = document.getElementById('m3u8Url');
    var refererInput = document.getElementById('refererUrl');
    var minAdDurInput = document.getElementById('minAdDur');
    var maxAdDurInput = document.getElementById('maxAdDur');
    var analyzeBtn = document.getElementById('analyzeBtn');
    var statusMsg = document.getElementById('statusMsg');
    var loadingGif = document.getElementById('loadingGif');

    var step1 = document.getElementById('step1');
    var step2 = document.getElementById('step2');
    var step3 = document.getElementById('step3');
    var stepLabel1 = document.getElementById('stepLabel1');
    var stepLabel2 = document.getElementById('stepLabel2');
    var stepLabel3 = document.getElementById('stepLabel3');

    var cleanOutput = document.getElementById('cleanM3u8Output');
    var goToStep3Btn = document.getElementById('goToStep3Btn');
    var backToStep2Btn = document.getElementById('backToStep2Btn');
    var downloadPlaylistBtn = document.getElementById('downloadPlaylistBtn');
    var mergeMp4Btn = document.getElementById('mergeMp4Btn');
    var mergeLoadingGif = document.getElementById('mergeLoadingGif');
    var mergeProgressText = document.getElementById('mergeProgressText');
    var speedInfo = document.getElementById('speedInfo');
    var mergeProgressBar = document.getElementById('mergeProgressBar');
    var etaText = document.getElementById('etaText');
    var actionButtons = document.getElementById('actionButtons');
    var mergeStatus = document.getElementById('mergeStatus');

    var origDurEl = document.getElementById('origDur');
    var cleanDurEl = document.getElementById('cleanDur');
    var adCountEl = document.getElementById('adCount');
    var editorContainer = document.getElementById('editorContainer');
    var refreshEditorBtn = document.getElementById('refreshEditorBtn');

    // Step3 速度控制元素
    var speedModeSelect = document.getElementById('speedModeStep3');
    var manualConcurrencyInput = document.getElementById('manualConcurrencyStep3');
    var manualConcurrencyContainer = document.getElementById('manualConcurrencyContainerStep3');

    // ---- 监听手动并发显示 ----
    if (speedModeSelect) {
        speedModeSelect.addEventListener('change', function() {
            if (this.value === 'manual') {
                manualConcurrencyContainer.style.display = 'block';
            } else {
                manualConcurrencyContainer.style.display = 'none';
            }
        });
        // 初始状态
        if (speedModeSelect.value === 'manual') {
            manualConcurrencyContainer.style.display = 'block';
        } else {
            manualConcurrencyContainer.style.display = 'none';
        }
    }

    // ---- state ----
    var currentBlocks = [];
    var currentBlockInfos = [];
    var currentFinalBase = '';
    var currentTotalDuration = 0;
    var currentReferer = '';
    var currentCleanM3u8 = '';
    var hls = null;
    var currentBlobUrl = null;

    // 全局用于恢复 fetch
    var originalFetch = window.fetch;

    // ---- HLS functions ----
    function destroyHls() {
        if (hls) {
            hls.destroy();
            hls = null;
        }
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }
        var videoElem = document.getElementById('videoPreview');
        if (videoElem) {
            videoElem.removeAttribute('src');
            videoElem.load();
        }
    }

    function initHls(cleanM3u8, referer) {
        destroyHls();
        var videoElem = document.getElementById('videoPreview');
        if (!videoElem) return;
        var blob = new Blob([cleanM3u8], { type: 'application/vnd.apple.mpegurl' });
        var blobUrl = URL.createObjectURL(blob);
        currentBlobUrl = blobUrl;

        var config = {};
        if (referer) {
            config.xhrSetup = function(xhr, url) {
                xhr.setRequestHeader('Referer', referer);
            };
        }

        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hls = new Hls(config);
            hls.loadSource(blobUrl);
            hls.attachMedia(videoElem);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                videoElem.play().catch(function(e) {});
            });
        } else if (videoElem.canPlayType('application/vnd.apple.mpegurl')) {
            videoElem.src = blobUrl;
            videoElem.addEventListener('loadedmetadata', function() {
                videoElem.play().catch(function(e) {});
            });
        } else {
            var msg = document.createElement('p');
            msg.style.color = '#ef4444';
            msg.textContent = 'HLS not supported in this browser.';
            document.querySelector('#step2 .flex-row')?.after(msg);
        }
    }

    // ---- generate clean M3U8 ----
    function generateCleanM3u8() {
        var cleanSegments = [];
        for (var idx = 0; idx < currentBlockInfos.length; idx++) {
            var info = currentBlockInfos[idx];
            if (info.isAd) continue;
            for (var j = 0; j < info.segments.length; j++) {
                var seg = info.segments[j];
                var file = seg.file;
                if (!isAbsoluteUrl(file)) {
                    file = resolveUrl(currentFinalBase, file);
                }
                cleanSegments.push({ duration: seg.duration, file: file });
            }
        }

        var cleanM3u8 = '#EXTM3U\n';
        cleanM3u8 += '#EXT-X-VERSION:3\n';
        cleanM3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n';
        cleanM3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
        cleanM3u8 += '#EXT-X-TARGETDURATION:8\n';
        var totalCleanDur = 0;
        for (var k = 0; k < cleanSegments.length; k++) {
            var seg = cleanSegments[k];
            cleanM3u8 += '#EXTINF:' + seg.duration.toFixed(6) + ',\n';
            cleanM3u8 += seg.file + '\n';
            totalCleanDur += seg.duration;
        }
        cleanM3u8 += '#EXT-X-ENDLIST\n';

        return { cleanM3u8: cleanM3u8, cleanDuration: totalCleanDur };
    }

    // ---- update UI after changes ----
    function updateAll() {
        var result = generateCleanM3u8();
        var cleanM3u8 = result.cleanM3u8;
        var cleanDuration = result.cleanDuration;
        currentCleanM3u8 = cleanM3u8;

        cleanOutput.value = cleanM3u8;

        var adCount = 0;
        for (var i = 0; i < currentBlockInfos.length; i++) {
            if (currentBlockInfos[i].isAd) adCount++;
        }

        origDurEl.textContent = formatTime(currentTotalDuration);
        cleanDurEl.textContent = formatTime(cleanDuration);
        adCountEl.textContent = adCount;

        renderEditor();
        initHls(cleanM3u8, currentReferer);
    }

    // ---- render editor table ----
    function renderEditor() {
        var html = '<table class="editor-table">';
        html += '<tr><th>Block #</th><th>Start Time</th><th>End Time</th><th>Duration</th><th>Segments</th><th>Is Ad?</th></tr>';
        var curTime = 0;
        for (var i = 0; i < currentBlockInfos.length; i++) {
            var info = currentBlockInfos[i];
            var start = curTime;
            var end = start + info.totalDuration;
            var checked = info.isAd ? 'checked' : '';
            html += '<tr>';
            html += '<td>' + (info.index + 1) + '</td>';
            html += '<td>' + formatTime(start) + '</td>';
            html += '<td>' + formatTime(end) + '</td>';
            html += '<td>' + info.totalDuration.toFixed(2) + 's</td>';
            html += '<td>' + info.segments.length + '</td>';
            html += '<td><input type="checkbox" data-index="' + info.index + '" ' + checked + '></td>';
            html += '</tr>';
            curTime = end;
        }
        html += '</table>';
        editorContainer.innerHTML = html;

        var checkboxes = editorContainer.querySelectorAll('input[type="checkbox"]');
        for (var j = 0; j < checkboxes.length; j++) {
            (function(cb) {
                cb.addEventListener('change', function(e) {
                    var idx = parseInt(e.target.dataset.index, 10);
                    currentBlockInfos[idx].isAd = e.target.checked;
                    updateAll();
                });
            })(checkboxes[j]);
        }
    }

    // ---- apply threshold from Step 1 and refresh ----
    function refreshEditor() {
        var minDur = parseFloat(minAdDurInput.value) || 0;
        var maxDur = parseFloat(maxAdDurInput.value) || Infinity;
        for (var i = 0; i < currentBlockInfos.length; i++) {
            var dur = currentBlockInfos[i].totalDuration;
            var isFirstOrLast = (i === 0 || i === currentBlockInfos.length - 1);
            currentBlockInfos[i].isAd = (!isFirstOrLast && dur >= minDur && dur <= maxDur);
        }
        updateAll();
    }

    // ---- show step 2 ----
    function showStep2(data) {
        currentBlocks = data.blocks;
        currentBlockInfos = data.blockInfos;
        currentFinalBase = data.finalBase;
        currentTotalDuration = data.totalDuration;

        step1.style.display = 'none';
        step2.style.display = 'block';
        step3.style.display = 'none';
        stepLabel1.classList.remove('active');
        stepLabel2.classList.add('active');
        stepLabel3.classList.remove('active');

        updateAll();
    }

    function setStatus(text, type) {
        statusMsg.textContent = text;
        statusMsg.className = 'status-msg';
        if (type) statusMsg.classList.add(type);
    }

    // ---- Step 3: Download playlist ----
    function downloadPlaylist() {
        if (!currentCleanM3u8) {
            alert('No playlist content. Please analyze first.');
            return;
        }
        var blob = new Blob([currentCleanM3u8], { type: 'application/vnd.apple.mpegurl' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'clean_playlist.m3u8';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ---- Step 3: Merge to MP4 using M3U8 class ----
    async function mergeToMp4() {
        if (!currentCleanM3u8) {
            alert('No playlist content. Please analyze first.');
            return;
        }

        // 隐藏按钮，显示进度区域
        actionButtons.style.display = 'none';
        mergeStatus.style.display = 'block';

        // 重置进度
        mergeLoadingGif.style.display = 'inline-block';
        mergeProgressText.textContent = 'Preparing download...';
        speedInfo.textContent = '';
        mergeProgressBar.value = 0;
        etaText.textContent = 'ETA: --';
        mergeMp4Btn.disabled = true;

        var blob = new Blob([currentCleanM3u8], { type: 'application/vnd.apple.mpegurl' });
        var blobUrl = URL.createObjectURL(blob);

        // 固定并发
        var maxConcurrency = 20;
        var mode = speedModeSelect.value;
        var concurrency;
        if (mode === 'manual') {
            concurrency = parseInt(manualConcurrencyInput.value) || 5;
            if (concurrency < 1) concurrency = 1;
        } else {
            var factor = 1.0;
            if (mode === 'balance') factor = 0.6;
            else if (mode === 'eco') factor = 0.3;
            else if (mode === 'fast') factor = 1.0;
            concurrency = Math.round(maxConcurrency * factor);
            if (concurrency < 1) concurrency = 1;
        }
        speedInfo.textContent = 'Concurrency: ' + concurrency;

        mergeProgressText.textContent = 'Starting download and merge...';

        var M3U8Class = M3U8.M3U8 || M3U8;
        var m3u8 = new M3U8Class();

        // 拦截 fetch 添加 Referer
        var referer = currentReferer;
        if (referer) {
            window.fetch = function(input, init) {
                var url = typeof input === 'string' ? input : input.url;
                if (url && (url.endsWith('.ts') || url.includes('.ts?'))) {
                    var newInit = init || {};
                    newInit.headers = newInit.headers || {};
                    if (typeof newInit.headers === 'object' && !(newInit.headers instanceof Headers)) {
                        newInit.headers['Referer'] = referer;
                    } else if (newInit.headers instanceof Headers) {
                        newInit.headers.set('Referer', referer);
                    }
                    return originalFetch.call(window, input, newInit);
                }
                return originalFetch.call(window, input, init);
            };
        }

        // 进度与 ETA
        var startTime = null;

        m3u8.on('progress', function(data) {
            var pct = data.percentage || 0;
            mergeProgressText.textContent = 'Downloading... ' + Math.round(pct) + '%';
            mergeProgressBar.value = pct;

            if (startTime === null && pct > 0) {
                startTime = Date.now();
            }
            if (startTime !== null && pct > 0) {
                var elapsed = (Date.now() - startTime) / 1000;
                var totalEstimated = elapsed / (pct / 100);
                var remaining = totalEstimated - elapsed;
                if (remaining > 0 && isFinite(remaining)) {
                    var minutes = Math.floor(remaining / 60);
                    var seconds = Math.floor(remaining % 60);
                    etaText.textContent = 'ETA: ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
                } else {
                    etaText.textContent = 'ETA: --';
                }
            }
        })
        .on('finished', function(data) {
            mergeProgressText.textContent = '✅ Merge complete! File downloaded.';
            mergeLoadingGif.style.display = 'none';
            mergeProgressBar.value = 100;
            etaText.textContent = 'ETA: Done';
            URL.revokeObjectURL(blobUrl);
            if (referer) window.fetch = originalFetch;
            // 恢复按钮
            actionButtons.style.display = 'flex';
            mergeMp4Btn.disabled = false;
        })
        .on('error', function(err) {
            mergeProgressText.textContent = '❌ Error: ' + err;
            mergeLoadingGif.style.display = 'none';
            mergeProgressBar.value = 0;
            etaText.textContent = 'ETA: Failed';
            URL.revokeObjectURL(blobUrl);
            if (referer) window.fetch = originalFetch;
            // 恢复按钮
            actionButtons.style.display = 'flex';
            mergeMp4Btn.disabled = false;
            console.error(err);
        });

        // 开始下载
        m3u8.start(blobUrl, {
            filename: 'merged_video',
            autoDownload: true
        });
    }

    // ---- event listeners ----
    analyzeBtn.addEventListener('click', async function() {
        var url = urlInput.value.trim();
        if (!url) {
            alert('Please enter M3U8 URL');
            return;
        }

        if (typeof Hls === 'undefined') {
            setStatus('Loading player library...', 'loading');
            try {
                await loadScript('https://cdn.jsdelivr.net/npm/hls.js@latest');
                var maxAttempts = 20;
                var attempts = 0;
                while (typeof Hls === 'undefined' && attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 200));
                    attempts++;
                }
                if (typeof Hls === 'undefined') {
                    throw new Error('Hls not defined after loading');
                }
            } catch (err) {
                setStatus('Error loading player: ' + err.message, 'error');
                return;
            }
        }

        var referer = refererInput.value.trim() || '';
        var minDur = parseFloat(minAdDurInput.value) || 0;
        var maxDur = parseFloat(maxAdDurInput.value) || Infinity;

        loadingGif.style.display = 'inline-block';
        analyzeBtn.disabled = true;
        setStatus('Analyzing...', 'loading');

        try {
            var data = await analyze(url, referer, minDur, maxDur);
            currentReferer = referer;
            setStatus('Analysis complete.', 'success');
            showStep2(data);
        } catch (err) {
            setStatus('Error: ' + err.message, 'error');
            console.error(err);
        } finally {
            loadingGif.style.display = 'none';
            analyzeBtn.disabled = false;
        }
    });

    urlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            analyzeBtn.click();
        }
    });

    refreshEditorBtn.addEventListener('click', function() {
        if (currentBlockInfos.length === 0) {
            alert('Please analyze first.');
            return;
        }
        refreshEditor();
    });

    goToStep3Btn.addEventListener('click', function() {
        if (!currentCleanM3u8) {
            alert('Please analyze first.');
            return;
        }
        destroyHls();
        step2.style.display = 'none';
        step3.style.display = 'block';
        stepLabel2.classList.remove('active');
        stepLabel3.classList.add('active');
        // 重置 Step3 界面：显示按钮，隐藏进度
        actionButtons.style.display = 'flex';
        mergeStatus.style.display = 'none';
        mergeProgressText.textContent = '';
        mergeLoadingGif.style.display = 'none';
        mergeMp4Btn.disabled = false;
        speedInfo.textContent = '';
        mergeProgressBar.value = 0;
        etaText.textContent = 'ETA: --';
    });

    backToStep2Btn.addEventListener('click', function() {
        step3.style.display = 'none';
        step2.style.display = 'block';
        stepLabel3.classList.remove('active');
        stepLabel2.classList.add('active');
        if (currentCleanM3u8) {
            initHls(currentCleanM3u8, currentReferer);
        }
    });

    downloadPlaylistBtn.addEventListener('click', downloadPlaylist);
    mergeMp4Btn.addEventListener('click', mergeToMp4);

    window.addEventListener('beforeunload', function() {
        destroyHls();
        // 恢复原始 fetch（如果被覆盖）
        if (window.fetch !== originalFetch) {
            window.fetch = originalFetch;
        }
    });
})();
