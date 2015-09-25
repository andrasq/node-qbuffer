QBuffer
=======

Very fast binary stream buffer, to be able to coalesce then re-split chunked binary data.
Handy for concatenated byte-counted binary or mixed text/binary data like BSON entities
or beanstalkd responses.  Reads over a million 200B lines per second from 50kB chunks.

For easier throttling and event loop control, QBuffer implements pull-based flow
control.  It buffers incoming data on write, but reading happens when
the code is ready for the data, not when the data happens to arrive.


Summary
-------

To extract json lines from an http response body:

        var assert = require('assert')
        var http = require('http')
        var QBuffer = require('qbuffer')

        var qbuf = new QBuffer()
        http.request("http://example.com/get/json/lines", function(res) {
            res.on('data', function(chunk) {
                qbuf.write(chunk)
            })
            res.on('end', function() {
                var line, json
                while ((line = qbuf.getline()) !== null) {
                    json = JSON.parse(line)
                }
                assert(qbuf.length === 0)
            })
        })

To extract bson buffers from a stream:

        var qbuf = new QBuffer()
        qbuf.setReadEncoding('utf8')
        qbuf.setDelimiter(function() {
            if (this.length <= 4) return -1
            var len = this.peekbytes(4)
            return len[0] + len[1] * 256 + len[2] * 65536 + len[3] * 16777216
        })

        var line, bsonArray = []
        stream.on('data', function(chunk) {
            qbuf.write(chunk)
            while ((line = qbuf.getline()) !== null) bsonArray.push(line)
        })
        stream.on('end', function() {
            while ((line = qbuf.getline()) !== null) bsonArray.push(line)
            if (qbuf.length > 0) throw new Error("incomplete last entity")
        })


Methods
-------

### new QBuffer( opts )

Options:
- `highWaterMark` - when to ask that input be throttled (default 1024000)
- `lowWaterMark` - when to ask that input resume (default 40960)
- `encoding` - the default encoding to use, as set with `setEncoding()`
- `readEncoding` - as set with `setReadEncoding`
- `writeEncoding` - as set with `setWriteEncoding`

### buf.length

The number of unread bytes currently in the buffer.

### buf.readEncoding

The default character encoding currently in effect for reading strings from the buffer.

### buf.writeEncoding

The default character encoding currently in effect when writing s trings to the buffer.

### buf.getline( )

Remove and return the next record from the buffer, or null if no complete line
is present.  By default records are newline terminated characters, with the
newline included as part of the record.

### buf.peekline( )

Just like `getline`, but do not advance the read point, do not consume the
returned bytes.  Calling `peekline` a second time will return the same line
again.

### buf.unget( data [,encoding] )

Prepend the data to the start of the buffered data.  The data may be a string
or a Buffer.  The next call to read() or getline() etc will return the newly
prepended bytes.

### buf.setDelimiter( delimiter )

Define the record delimiter for records returned by getline().  The default is
`"\n"`, for newline terminated strings.

Delimiter can be

- `string` 1 or 2 character terminating string.  The terminator is considered
  part of the record, and is returned in the data
- `number` length for fixed length records.
- `function` that returns the computed length of the record.  The delimiter
  function is invoked as a method call with `this` set to the qbuffer instance
- `null` to restore the built-in default of newline terminated strings

### buf.read( [nbytes] [,encoding] )

Remove and return the next nbytes bytes from the buffer, or null if not that
many bytes available.  Returns a string converted with the given encoding
or specified with setEncoding(), else a Buffer if no encoding is in effect.
If no byte count is given, will return all buffered data.

### buf.peekbytes( nbytes [,encoding] )

Just like read, but do not advance the read point.

### buf.indexOfChar( char [,start] )

Return the offset in the unread data of the first occurrence of char at
or after offset `start` in the data stream.

With this call getline() can be implemented as `buf.read(buf.indexOfChar("\n") + 1)`

### buf.indexOfChar2( char1, char2 [,start] )

Return the offset of the first occurrence of char1 that is followed immediately
by char2.  This is a work-around while there is no indexOf() call.

### buf.skipbytes( nbytes )

Advance the read position by nbytes and discard the bytes skipped over.  If
there are not that many unread bytes it empties the buffer.

### buf.setEncoding( encoding )

Set both setReadEncoding() and setWriteEncoding() to the same encoding.

The default encoding can be overridden call by call in read() and write().
The read end write encodings can also be set separately, see below.

### buf.setReadEncoding( encoding )

Specify how to encode the returned bytes, eg 'utf8' or 'base64'.  Used in
the read calls read(), peekbytes(), getline(), peekline().  Analogous to
Stream.setEncoding().

Setting an encoding will cause strings to be read from the QBuffer.  To clear
the encoding in effect setReadEncoding to null.  The default is null, to return
Buffer objects.

### buf.setWriteEncoding( encoding )

Specify how to decode to binary the written strings.  Used in write() and
unget().  Analogous to Stream.setDefaultEncoding().

### buf.write( data [,encoding] [,callback(err, nbytes)] )

Append data to the buffer.  The data may be provided either as a string or in a
Buffer.  Strings are converted to bytes using the given encoding or that
specified by setEncoding.

Returns true if ready to buffer more data, false to throttle the input.  The
callback, if specified, will be called with the count of bytes (not characters)
appended.

### buf.end( [data] [,encoding] [,callback] )

Append an optional last chunk to the buffered data, and close the buffer.  Any
subsequent attempt to write will throw an error or call back with error.

### buf.pipeFrom( stream )

Write the data chunks emitted by the stream into the qbuffer with an on('data')
event listener.  This is a convenience method; handling stream errors is still
up the caller.  The qbuf stream is not ended on an 'end' event.

### buf.pipeTo( stream [,options] )

Pipe records obtained with getline to the stream.  Flow control is handled.
The buffered data is chunked into records per the current record delimiter in
effect, and written to the stream one record at a time.  The default records
are "\n" newline terminated lines.  The piped records will be converted per
the current setWriteEncoding() in effect (default `null` for Buffers).

Piping continues until the stream is closed or is unpiped with `unpipeTo()`.
Unlike streams, Qbuffer can pipeTo to only one destination at a time.  As a
work-around, pipeTo a fanout stream that pipes to the final destinations.

Qbuffers always re-split the piped data, they do not support raw pass-through.
To pipe data in bulk without regard to record boundaries, eg fixed 100K chunks,
specify an appropriate record delimiter `setDelimiter(102400)` along with the
`allowFragments: true` option.

Options:

- `end` - end the output stream when input ends
- `allowFragments` - also pipe any partial records at the end of the buffered data.
  The default is to wait for a complete record before writing it to the pipe.

### buf.unpipeTo( [stream] )

Stop piping records to the output pipe.

### buf.pause( )

Suspend output streaming.  Data will be buffered until output is resumed.
Explicit calls to read() will still return data.

### buf.resume( )

Resume output streaming, and immediately drain as much data as the target will
accept.


A Note on Piping
----------------

Consume a stream with an on('data') event listener.  `qbuffer.pipeFrom(stream)`
does just that.  Stream errors must be handled by the caller.

The simple use case of piping streams into a qbuf is supported;
`stream.pipe(qbuf)` arranges for on 'data' chunks to be written to qbuf.  The
input is throttled following the highWaterMark option, and is record-based not
bytecount-based.

One big benefit of piping is the built-in flow control and data throttling.
However, qbuffers help separate variable length records.  With variable-length
records, automatically pausing the input risks stopping the data flow before the
end of the current record is received; once paused, the end never will arrive.
This would cause deadlock.  Since only the application knows the record layout,
the flow can only be controlled from the application, not from the data stream.
The application can define its record structure with `setDelimiter()`, or
can set a fixed record size for raw byte-counted binary transfers.


Todo
----

- more unit tests
- indexOf() method
- writeTo(writeFunc, endFunc) method to pipe records to code


Related Work
------------

- [split](http://npmjs.com/package/split) - very fast regex-delimited text stream re-splitter
- [through](http://npmjs.com/package/through) - clever shim for making a write function pipable
