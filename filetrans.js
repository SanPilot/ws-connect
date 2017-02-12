// WebSockets download/upload speed test

// File server location
var downloadURL = "http://localhost:3001";

// Callback for when the file is recieved
var handleFileSelect = (e, attempt) => {
  // Start the timer if it isn't started
  if(!timerStart) {
    var timerStart = Date.now();
  }
  attempt = attempt || 0;
  if(attempt > 5) {
    console.error("Upload failed.");
    return;
  }

  // Make sure a file is selected
  if(e.target.files.length === 0) {
    console.warn("No file selected. Upload aborted.");
    return;
  }

  // Get the files
  var file = e.target.files;

  // Make sure there is only one file
  if(file.length !== 1) {
    console.error("Can only upload one file. Upload aborted");
    return;
  }

  file = file[0];
  var info = {
    name: file.name,
    type: (file.type.length ? file.type : "application/octet-stream"),
    size: file.size
  };

  console.log("Uploading file '" + info.name + "'", "\nType: " + (info.type.length ? info.type : "Unknown"), "\nSize: " + info.size + " bytes");

  // Function to convert a blob to an array
  var createArrBuff = (blob, callback) => {
    // Create the file reader
    var reader = new FileReader();

    // Failure
    reader.onabort = reader.onerror = () => {
      console.error("Upload failed. Trying again...");
      handleFileSelect(e, ++attempt);
      return;
    };

    // Success
    reader.onload = (ab) => {
      callback(ab.target.result);
    };

    // Read the blob
    reader.readAsArrayBuffer(blob);
  };

  // Create the upload
  s({
    action: "createUpload",
    file: info
  }, true).onResponse((response) => {
    if(response.status !== "success") {
      console.error("Upload failed (" + response.error + ") Trying again...");
      handleFileSelect(e, ++attempt);
      return;
    }
    var uploadConnection = new WebSocket(wsAddress);
    uploadConnection.onclose = () => {
      console.error("Upload failed. Trying again");
      handleFileSelect(e, ++attempt);
    };

    // Successful connection
    uploadConnection.onopen = (ue) => {

      // Initate file transfer
      uploadConnection.onmessage = (ue) => {
        var resp = JSON.parse(ue.data);
        if(resp.status === 'error') {
          console.error("Upload failed (" + resp.error + ") Trying again...");
          handleFileSelect(e, ++attempt);
          return;
        }
        uploadConnection.onmessage = (ue) => {
          var resp = JSON.parse(ue.data);
          if(resp.status === 'error') {
            console.error("Upload failed (" + resp.error + ") Trying again...");
            handleFileSelect(e, ++attempt);
            return;
          }

          console.info("Successfully opened file transfer connection");

          // Figure out number of pieces
          var numPieces = 1;
          if(info.size > response.maxMessageSize) {
            numPieces = Math.ceil(info.size / response.maxMessageSize);
          }

          // Send each piece
          var sendPiece = (piece, pAttempt) => {
            if(pAttempt > 5) {
              console.error("Upload failed. Trying again...");
              handleFileSelect(e, ++attempt);
              return;
            }
            uploadConnection.onmessage = (ue) => {
              var resp = JSON.parse(ue.data);
              if(resp.status === 'error') {
                console.error("There was an error uploading piece " + piece + "/" + numPieces + " (" + resp.error + ") Trying again...");
                sendPiece(piece, ++pAttempt);
                return;
              }

              // Piece was uploaded successfully, send next piece
              console.info("Uploaded piece " + piece + "/" + numPieces + " (" + Math.floor((piece/numPieces) * 100) + "%)");
              if(piece === numPieces) {
                // Finalize the upload
                s({action: "finalizeUpload", fileId: response.upload.id}, true).onResponse((resp) => {
                  if(resp.status !== "success") {
                    console.error("Upload failed (" + resp.error + ") Trying again...");
                    handleFileSelect(e, ++attempt);
                    return;
                  }

                  // Successfully completed upload
                  var opTime = (Date.now() - timerStart) / 1000;
                  console.log("Upload complete. Uploaded " + info.size + " bytes in " + opTime + " seconds (" + Math.floor((info.size / opTime) / 1000) + " KB/s)", "\nFile ID: " + response.upload.id + " (" + info.name + ")");
                  return;
                });
                return;
              }
              sendPiece(++piece, 0);
            };
            setTimeout(() => {
              createArrBuff(file.slice(response.maxMessageSize * (piece - 1), (response.maxMessageSize * (piece - 1)) + response.maxMessageSize), (arraybuf) => {
                uploadConnection.send(arraybuf);
              });
            }, 250);
          };

          // Start the upload
          console.info("Starting upload...");
          sendPiece(1, 0);
        };
        uploadConnection.send(response.upload.id);
      };
      uploadConnection.send("fileupload");
    };
  });
};
file.onchange = handleFileSelect;

// Test if a response was failure
var parse = (resp, boolean) => {
  boolean = boolean || false;
  resp = (resp.constructor !== Object ? JSON.parse(resp) : resp);
  if(resp.status === "success") {
    return resp;
  } else {
    return (boolean ? false : resp);
  }
};

// Complete a download
var download = (fileId, attempt) => {
  var blobArray = []; // Array to hold blobs
  attempt = attempt || 0;
  if (attempt > 4) {
    console.error("Download failed");
    return;
  }
  s({action: "fileInfo", fileId: fileId}, true).onResponse((response) => {
    var resp = parse(response, false);
    if(resp.status != 'success') {
      console.error(`Download failed, trying again... (${resp.error})`);
      setTimeout(() => {download(fileId, ++attempt);}, 100);
      return;
    }
    var file = resp.file;
    console.info("Downloading file '" + file.fileName + "'", "\nFile ID: " + file.id, "\nType: " + file.mimetype, "\nSize: " + file.size + " bytes");

    s({action: 'createDownload', fileId: file.id}, true).onResponse((response) => {
      var resp = parse(response, true);
      if(!resp) {
        console.error(`Download failed, trying again... (${resp.error})`);
        setTimeout(() => {download(fileId, ++attempt);}, 100);
        return;
      }
      var downloadId = resp.content.id;

      // Download the file to desktop
      var a = document.createElement("a");
      document.body.appendChild(a);
      a.style = "display: none";
      a.href = downloadURL + "/" + downloadId;
      a.click();
    });
  });
};
