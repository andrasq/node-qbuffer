QBuffer
=======

fast binary stream buffer, to be able to merge and re-split chunked binary data


Methods
-------

### new QBuffer( opts )

Options:
- highWaterMark
- lowWaterMark

### buf.getline( )

Remove and return the next newline-terminated line from the buffer, or null if
no complete line present.  The newline is included as part of the line.

### buf.peekline( )

Just like `getline`, but do not advance the read point, do not remove the bytes
returned.  Calling `peekline` a second time will return the same line again.

### buf.read( nbytes )

Remove and return the next nbytes bytes from the buffer, or null if not that
many bytes available.

### buf.peekbytes( nbytes )

Just like read, but do not advance the read point past the bytes returned.

### buf.setEncoding( encoding )

Specify how to encode the returned bytes, eg 'utf8' or 'base64'.  Specifyng an
encoding will cause strings to be read from the QBuffer.  The default, an
encoding value of null, returns Buffer objects instead of strings.

### buf.write( data [,encoding] [,callback] )

Append data to the buffer.  The data may be provided either as a string or in a
Buffer.  The callback, if specified, will be called with the count of bytes
(not characters) appended.


Todo
----

- unit tests
- make pipable (event emitter), if no performance penalty
