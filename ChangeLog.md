1.4.0

- test with qnit
- fix documentation to reflect that default encoding is `null`

1.3.0

- processLines() method

1.2.0

- linelength() method

1.1.0

- setDecoder() method and 'decoder' constructor option

1.0.5

- return null on peek(0) or read(0) to not deref non-existent chunks[0]
- document qbuf.chunks and qbuf.ended

1.0.0

- removed piping and throttling to simplify the code, not really useful (see piping.js)
- renamed peekbytes/skipbytes to peek/skip
- removed separate readEncoding/writeEncoding
- exposed indexOfCharcode method
- removed indexOfChar2 method in favor of indexOfCharcode
- finalized api, staying with getline/read/write/peek/skip

0.9.0

- end() method
- cache _nextLine offset and throttle writers on write()
- can be piped into with stream.pipe(qbuff) with flow control
- enable highWaterMark and lowWaterMark

0.8.0

- pause() and resume() methods to explicitly stop pipeTo streaming

0.7.0

- pipeTo() stream with flow control
- unpipeTo()

0.6.0

- setReadEncoding(), setWriteEncoding() methods
- unget() method

0.5.1

- setDelimiter() method for getline/peekline

0.4.0

- indexOfChar2 method
- unit test with random block sizes

0.3.0

- fix _concat
- skipbytes method
- pipeFrom method
- remove highWaterMark and lowWaterMark pending user-specified delimiters
- document opts.encoding constructor option

0.2.0

- new indexOfChar method
- fixed _indexOfCharcode
- fixed peekbytes
- refactored read and netted 50% speedup

0.1.0

- fix peekline
- add _read
- tune _concat
