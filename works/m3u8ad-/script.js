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

    // fetch with optional Referer header
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

    // ---- dynamic script loading ----
    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            var existing = document.querySelector('script[src="' + src + '"]');
            if (existing) {
                resolve();
                return;
            }
            var script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = function() { reject(new Error('Failed to load script: ' + src)); };
            document.head.appendChild(script);
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

    var origDurEl = document.getElementById('origDur');
    var cleanDurEl = document.getElementById('cleanDur');
    var adCountEl = document.getElementById('adCount');
    var editorContainer = document.getElementById('editorContainer');
    var refreshEditorBtn = document.getElementById('refreshEditorBtn');

    // ---- state ----
    var currentBlocks = [];
    var currentBlockInfos = [];
    var currentFinalBase = '';
    var currentTotalDuration = 0;
    var currentReferer = '';
    var currentCleanM3u8 = '';

    var hls = null;
    var currentBlobUrl = null;

    // ---- HLS functions with Referer ----
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

        if (Hls.isSupported()) {
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

    // ---- Step 3: Merge to MP4 using m3u8-downloader-js (dynamically loaded) ----
    async function mergeToMp4() {
        if (!currentCleanM3u8) {
            alert('No playlist content. Please analyze first.');
            return;
        }

        // Load m3u8-downloader-js if not already loaded
        if (typeof M3U8 === 'undefined') {
            mergeProgressText.textContent = 'Loading merger library...';
            mergeLoadingGif.style.display = 'inline-block';
            mergeMp4Btn.disabled = true;
            try {
                await loadScript('https://cdn.jsdelivr.net/gh/SuperZombi/m3u8-downloader-js/m3u8.js');
            } catch (err) {
                mergeProgressText.textContent = 'Error loading merger: ' + err.message;
                mergeLoadingGif.style.display = 'none';
                mergeMp4Btn.disabled = false;
                return;
            }
            // Verify it's loaded
            if (typeof M3U8 === 'undefined') {
                mergeProgressText.textContent = 'Error: M3U8 library not loaded properly.';
                mergeLoadingGif.style.display = 'none';
                mergeMp4Btn.disabled = false;
                return;
            }
        }

        // Disable button and show loading
        mergeMp4Btn.disabled = true;
        mergeLoadingGif.style.display = 'inline-block';
        mergeProgressText.textContent = 'Initializing...';

        // Create a Blob URL for the clean M3U8 content
        var blob = new Blob([currentCleanM3u8], { type: 'application/vnd.apple.mpegurl' });
        var blobUrl = URL.createObjectURL(blob);

        // Prepare options for downloader
        var options = {
            output: 'merged_video.mp4',
            concurrency: 5, // 5 concurrent downloads
            headers: currentReferer ? { 'Referer': currentReferer } : {}
        };

        try {
            var m3u8 = new M3U8();
            var download = m3u8.start(blobUrl, options);

            download.on('progress', function(progress) {
                var percent = Math.round(progress * 100);
                mergeProgressText.textContent = 'Downloading & merging... ' + percent + '%';
            });

            download.on('finished', function() {
                // The library automatically downloads the file? Actually it triggers download automatically.
                // But we need to handle, it might have already triggered download.
                // We'll clean up and update status.
                mergeLoadingGif.style.display = 'none';
                mergeProgressText.textContent = 'Merge complete! File downloaded.';
                mergeMp4Btn.disabled = false;
                URL.revokeObjectURL(blobUrl);
            });

            download.on('error', function(message) {
                mergeProgressText.textContent = 'Error: ' + message;
                mergeLoadingGif.style.display = 'none';
                mergeMp4Btn.disabled = false;
                URL.revokeObjectURL(blobUrl);
                console.error('Download error:', message);
            });

        } catch (err) {
            mergeProgressText.textContent = 'Error: ' + err.message;
            mergeLoadingGif.style.display = 'none';
            mergeMp4Btn.disabled = false;
            URL.revokeObjectURL(blobUrl);
            console.error(err);
        }
    }

    // ---- event listeners ----
    analyzeBtn.addEventListener('click', async function() {
        var url = urlInput.value.trim();
        if (!url) {
            alert('Please enter M3U8 URL');
            return;
        }

        // Load hls.js if not already loaded
        if (typeof Hls === 'undefined') {
            setStatus('Loading player library...', 'loading');
            try {
                await loadScript('https://cdn.jsdelivr.net/npm/hls.js@latest');
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
        step2.style.display = 'none';
        step3.style.display = 'block';
        stepLabel2.classList.remove('active');
        stepLabel3.classList.add('active');
        // Reset merge status
        mergeProgressText.textContent = '';
        mergeLoadingGif.style.display = 'none';
        mergeMp4Btn.disabled = false;
    });

    backToStep2Btn.addEventListener('click', function() {
        step3.style.display = 'none';
        step2.style.display = 'block';
        stepLabel3.classList.remove('active');
        stepLabel2.classList.add('active');
    });

    downloadPlaylistBtn.addEventListener('click', downloadPlaylist);
    mergeMp4Btn.addEventListener('click', mergeToMp4);

    // ---- clean up on page unload ----
    window.addEventListener('beforeunload', function() {
        destroyHls();
    });
})();
