// WebSockets download/upload speed test

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

  // Read the file
  var reader = new FileReader();
  reader.onabort = reader.onerror = () => {
    console.error("Upload failed. Trying again...");
    handleFileSelect(e, ++attempt);
    return;
  };
  reader.onload = (ab) => {
    file = ab.target.result;
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
            var pieces = [];
            // Split the file
            if(info.size > response.maxMessageSize) {
              var numPieces = Math.ceil(info.size / response.maxMessageSize);
              pieces = [];
              for(var i = 0; i < numPieces; i++) {
                pieces[i] = file.slice(response.maxMessageSize * i, (response.maxMessageSize * i) + response.maxMessageSize);
              }
            } else {
              pieces = [file];
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
                  console.error("There was an error uploading piece " + piece + "/" + pieces.length + " (" + resp.error + ") Trying again...");
                  sendPiece(piece, ++pAttempt);
                  return;
                }

                // Piece was uploaded successfully, send next piece
                console.info("Uploaded piece " + piece + "/" + pieces.length + " (" + Math.floor((piece/pieces.length) * 100) + "%)");
                if(piece === pieces.length) {
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
                uploadConnection.send(pieces[piece - 1]);
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

  reader.readAsArrayBuffer(file);
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
  // Start the timer if it isn't started
  if(!timerStart) {
    var timerStart = Date.now();
  }
  attempt = attempt || 0;
  if (attempt > 5) {
    console.error("Download failed");
    return;
  }
  s({action: "fileInfo", fileId: fileId}, true).onResponse((response) => {
    var resp = parse(response, true);
    if(!resp) {
      console.error(`Download failed, trying again... (${resp.error})`);
      download(fileId, ++attempt);
      return;
    }
    var file = resp.file;
    console.info("Downloading file '" + file.fileName + "'", "\nFile ID: " + file.id, "\nType: " + file.mimetype, "\nSize: " + file.size + " bytes");

    s({action: 'createDownload', fileId: file.id}, true).onResponse((response) => {
      var resp = parse(response, true);
      if(!resp) {
        console.error(`Download failed, trying again... (${resp.error})`);
        download(fileId, ++attempt);
        return;
      }
      var downloadId = resp.download,
      numPieces = resp.pieces;

      var downloadConnection = new WebSocket(wsAddress);
      downloadConnection.onclose = () => {
        console.error("Download failed, trying again...");
        download(fileId, ++attempt);
      };
      downloadConnection.onopen = () => {
        downloadConnection.onmessage = (e) => {
          var resp = parse(e.data, true);
          if(!resp) {
            console.error(`Download failed, trying again... (${resp.error})`);
            download(fileId, ++attempt);
            return;
          }
          downloadConnection.onmessage = (e) => {
            var resp = parse(e.data, true);
            if(!resp) {
              console.error(`Download failed, trying again... (${resp.error})`);
              download(fileId, ++attempt);
              return;
            }
            var downloadPiece = (piece, dAttempt) => {
              if(dAttempt > 5) {
                console.error("Download failed, trying again...");
                download(fileId, ++attempt);
                return;
              }
              downloadConnection.onmessage = (e) => {
                var resp = (e.data.constructor === Blob ? true : parse(e.data, true));
                if(!resp) {
                  console.error(`Download of piece ${piece}/${numPieces} failed, trying again...`);
                  downloadPiece(piece, ++attempt);
                  return;
                }
                var progress = Math.floor((piece/numPieces) * 100);
                blobArray[piece - 1] = e.data; // Add this blob to the array
                console.info(`Downloaded piece ${piece}/${numPieces} (${progress}%)`);

                if(piece < numPieces) {
                  downloadPiece(++piece, 0);
                } else {
                  // Successfully completed upload
                  var opTime = (Date.now() - timerStart) / 1000;
                  var transSpeed = Math.floor((file.size / opTime) / 1000);
                  // Create the result blob
                  var completedDownload = new Blob(blobArray, {type: "application/octet-stream"}),
                  downloadURL = URL.createObjectURL(completedDownload);
                  // Download the file to desktop
                  var a = document.createElement("a");
                  document.body.appendChild(a);
                  a.style = "display: none";
                  a.href = downloadURL;
                  a.download = file.fileName;
                  a.click();
                  URL.revokeObjectURL(downloadURL);

                  console.log(`Download complete. Downloaded ${file.size} bytes in ${opTime} seconds (${transSpeed} KB/s)`, `\nFile '${file.fileName}'`);
                  return;
                }
              };
              downloadConnection.send(piece - 1);
            };
            downloadPiece(1, 0);
          };
          downloadConnection.send(downloadId);
        };
        downloadConnection.send("filedownload");
      };
    });
  });
};
