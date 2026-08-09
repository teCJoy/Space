(function() {
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

    async function fetchContent(url) {
        var resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + resp.statusText);
        return await resp.text();
    }

    async function followMaster(content, baseUrl) {
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
        var subContent = await fetchContent(finalSubUrl);
        var subBase = extractBaseUrl(finalSubUrl);
        return followMaster(subContent, subBase);
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

    async function analyze(url) {
        var rawContent = await fetchContent(url);
        var baseUrl = extractBaseUrl(url);

        var result = await followMaster(rawContent, baseUrl);
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
            return {
                index: idx,
                segments: block,
                totalDuration: dur,
                isAd: (dur > 5 && dur < 45 && idx !== 0 && idx !== blocks.length - 1)
            };
        });

        var adIndices = [];
        for (var i = 0; i < blockInfos.length; i++) {
            if (blockInfos[i].isAd) adIndices.push(blockInfos[i].index);
        }

        var cleanSegments = [];
        for (var idx = 0; idx < blocks.length; idx++) {
            if (adIndices.indexOf(idx) !== -1) continue;
            for (var j = 0; j < blocks[idx].length; j++) {
                var seg = blocks[idx][j];
                var file = seg.file;
                if (!isAbsoluteUrl(file)) {
                    file = resolveUrl(finalBase, file);
                }
                cleanSegments.push({ duration: seg.duration, file: file });
            }
        }

        var cleanM3u8 = '#EXTM3U\n';
        cleanM3u8 += '#EXT-X-VERSION:3\n';
        cleanM3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n';
        cleanM3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
        cleanM3u8 += '#EXT-X-TARGETDURATION:8\n';
        var totalDuration = 0;
        for (var k = 0; k < cleanSegments.length; k++) {
            var seg = cleanSegments[k];
            cleanM3u8 += '#EXTINF:' + seg.duration.toFixed(6) + ',\n';
            cleanM3u8 += seg.file + '\n';
            totalDuration += seg.duration;
        }
        cleanM3u8 += '#EXT-X-ENDLIST\n';

        var tableHtml = '<table>';
        tableHtml += '<tr><th>Block #</th><th>Start Time</th><th>End Time</th><th>Duration</th><th>Segments</th><th>Note</th></tr>';
        var currentTime = 0;
        for (var m = 0; m < blockInfos.length; m++) {
            var info = blockInfos[m];
            var start = currentTime;
            var end = start + info.totalDuration;
            var dur = info.totalDuration;
            var segCount = info.segments.length;
            var note = info.isAd ? 'Ad (removed)' : '';
            tableHtml += '<tr><td>' + (info.index + 1) + '</td><td>' + formatTime(start) + '</td><td>' + formatTime(end) + '</td><td>' + dur.toFixed(2) + 's</td><td>' + segCount + '</td><td>' + note + '</td></tr>';
            currentTime = end;
        }
        tableHtml += '</table>';

        return {
            blockTable: tableHtml,
            cleanM3u8: cleanM3u8,
            totalDuration: currentTime,
            cleanDuration: totalDuration,
            adCount: adIndices.length
        };
    }

    var urlInput = document.getElementById('m3u8Url');
    var analyzeBtn = document.getElementById('analyzeBtn');
    var statusMsg = document.getElementById('statusMsg');

    var step1 = document.getElementById('step1');
    var step2 = document.getElementById('step2');
    var stepLabel1 = document.getElementById('stepLabel1');
    var stepLabel2 = document.getElementById('stepLabel2');

    var blockContainer = document.getElementById('blockTableContainer');
    var cleanOutput = document.getElementById('cleanM3u8Output');
    var copyBtn = document.getElementById('copyBtn');
    var downloadBtn = document.getElementById('downloadBtn');
    var copyMsg = document.getElementById('copyMsg');
    var backBtn = document.getElementById('backBtn');
    var videoElem = document.getElementById('videoPreview');

    var origDurEl = document.getElementById('origDur');
    var cleanDurEl = document.getElementById('cleanDur');
    var adCountEl = document.getElementById('adCount');

    var hls = null;
    var currentBlobUrl = null;

    function destroyHls() {
        if (hls) {
            hls.destroy();
            hls = null;
        }
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }
        videoElem.removeAttribute('src');
        videoElem.load();
    }

    function initHls(cleanM3u8) {
        destroyHls();
        var blob = new Blob([cleanM3u8], { type: 'application/vnd.apple.mpegurl' });
        var blobUrl = URL.createObjectURL(blob);
        currentBlobUrl = blobUrl;
        if (Hls.isSupported()) {
            hls = new Hls();
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
            document.querySelector('#step2 .flex-row').insertAdjacentHTML('afterend', '<p style="color:#ef4444;">HLS not supported in this browser.</p>');
        }
    }

    function showStep2(result) {
        blockContainer.innerHTML = result.blockTable;
        cleanOutput.value = result.cleanM3u8;
        origDurEl.textContent = formatTime(result.totalDuration);
        cleanDurEl.textContent = formatTime(result.cleanDuration);
        adCountEl.textContent = result.adCount;

        step1.style.display = 'none';
        step2.style.display = 'block';
        stepLabel1.classList.remove('active');
        stepLabel2.classList.add('active');

        initHls(result.cleanM3u8);
    }

    function setStatus(text, type) {
        statusMsg.textContent = text;
        statusMsg.className = 'status-msg';
        if (type) statusMsg.classList.add(type);
    }

    analyzeBtn.addEventListener('click', async function() {
        var url = urlInput.value.trim();
        if (!url) {
            alert('Please enter M3U8 URL');
            return;
        }

        setStatus('Analyzing...', 'loading');
        analyzeBtn.disabled = true;

        try {
            var result = await analyze(url);
            setStatus('Analysis complete.', 'success');
            showStep2(result);
        } catch (err) {
            setStatus('Error: ' + err.message, 'error');
            console.error(err);
        } finally {
            analyzeBtn.disabled = false;
        }
    });

    urlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            analyzeBtn.click();
        }
    });

    copyBtn.addEventListener('click', function() {
        var text = cleanOutput.value;
        if (!text) {
            alert('No content to copy, please analyze first.');
            return;
        }
        navigator.clipboard.writeText(text).then(function() {
            copyMsg.style.opacity = '1';
            copyMsg.textContent = 'Copied!';
            setTimeout(function() { copyMsg.style.opacity = '0'; }, 2000);
        }).catch(function() {
            cleanOutput.select();
            document.execCommand('copy');
            copyMsg.style.opacity = '1';
            copyMsg.textContent = 'Copied (fallback)';
            setTimeout(function() { copyMsg.style.opacity = '0'; }, 2000);
        });
    });

    downloadBtn.addEventListener('click', function() {
        var text = cleanOutput.value;
        if (!text) {
            alert('No content to download, please analyze first.');
            return;
        }
        var blob = new Blob([text], { type: 'application/vnd.apple.mpegurl' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'clean_playlist.m3u8';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        copyMsg.style.opacity = '1';
        copyMsg.textContent = 'Download started';
        setTimeout(function() { copyMsg.style.opacity = '0'; }, 2000);
    });

    backBtn.addEventListener('click', function() {
        destroyHls();
        step2.style.display = 'none';
        step1.style.display = 'block';
        stepLabel2.classList.remove('active');
        stepLabel1.classList.add('active');
        setStatus('');
        cleanOutput.value = '';
        blockContainer.innerHTML = '';
        origDurEl.textContent = '-';
        cleanDurEl.textContent = '-';
        adCountEl.textContent = '-';
        copyMsg.style.opacity = '0';
    });

    window.addEventListener('beforeunload', function() {
        destroyHls();
    });
})();