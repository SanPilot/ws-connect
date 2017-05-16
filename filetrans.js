// Backend download/upload speed test

// File server location
var transferURL = "http://localhost:3001";

// Callback for when the file is recieved
var handleFileSelect = (e, attempt, uploadNum) => {
  // Start the timer if it isn't started
  if(!timerStart) {
    var timerStart = Date.now();
  }

  // If there have already been 5 attempts, give up
  attempt = attempt || 0;
  if(attempt > 0) return;
  if(attempt > 5) {
    console.error("Upload failed.");
    return;
  }

  // Figure out which file to upload
  uploadNum = uploadNum || 0;

  // Make sure a file is selected
  if(e.target.files.length === 0) {
    console.warn("No file selected. Upload aborted.");
    return;
  }

  // Get the files
  var file = e.target.files;

  file = file[uploadNum];
  var info = {
    name: file.name,
    type: (file.type.length ? file.type : "application/octet-stream"),
    size: file.size
  };

  console.log("Uploading file '" + info.name + "'", "\nType: " + (info.type.length ? info.type : "Unknown"), "\nSize: " + info.size + " bytes");

  // Create the upload
  s({
    action: "createUpload",
    file: info
  }, true).onResponse((response) => {
    if(response.status !== "success") {
      console.error("Upload failed (" + response.error + ") Trying again...");
      handleFileSelect(e, ++attempt, uploadNum);
      return;
    }

    // Create the AJAX request
    var xhr = new XMLHttpRequest();
    xhr.open('POST', transferURL + "/" + response.upload.id);

    // Handle completed upload
    xhr.onload = () => {
      if(xhr.status === 200) {
        // Successfully completed upload
        var opTime = (Date.now() - timerStart) / 1000;
        console.log("Upload complete. Uploaded " + info.size + " bytes in " + opTime + " seconds (" + Math.floor((info.size / opTime) / 1000) + " KB/s)", "\nFile ID: " + response.upload.id + " (" + info.name + ")");

        // If more than one file was selected, upload the next file
        if(uploadNum + 1 !== e.target.files.length) {
          handleFileSelect(e, 0, ++uploadNum);
        }
      } else {
        console.error("Upload failed. Trying again...");
        handleFileSelect(e, ++attempt, uploadNum);
      }
    };

    // Handle upload errors
    xhr.onerror = xhr.onabort = () => {
      console.error("Upload failed. Trying again...");
      handleFileSelect(e, ++attempt, uploadNum);
    };

    // Log progress
    xhr.upload.onprogress = (pe) => {
      var percent = Math.round((pe.loaded / pe.total) * 100);
      console.info(`Uploaded ${pe.loaded} / ${pe.total} bytes (${percent}%)`);
    };

    // Begin the upload
    xhr.send(file);
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
      console.error(`Download failed, trying again... (${response.error})`);
      setTimeout(() => {download(fileId, ++attempt);}, 100);
      return;
    }
    var file = resp.file;
    console.info("Downloading file '" + file.fileName + "'", "\nFile ID: " + file.id, "\nType: " + file.mimetype, "\nSize: " + file.size + " bytes");

    s({action: 'createDownload', fileId: file.id}, true).onResponse((response) => {
      var resp = parse(response, true);
      if(!resp) {
        console.error(`Download failed, trying again... (${response.error})`);
        setTimeout(() => {download(fileId, ++attempt);}, 100);
        return;
      }
      var downloadId = resp.content.id;

      // Download the file to desktop
      var a = document.createElement("a");
      document.body.appendChild(a);
      a.style = "display: none";
      a.href = transferURL + "/" + downloadId;
      a.click();
    });
  });
};
